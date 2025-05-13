import { BBOService } from '../actions/paradexActions/getBBO.js';
import { SystemConfig } from '../interfaces/config.js';
import { BBOResponse } from '../interfaces/results.js';
import { validateSupportedToken, getMarketsForToken } from '../utils/validateSupportedToken.js';

// Structure pour stocker les données de prix en cache
interface CachedPrice {
  price: number;
  timestamp: number;
  source: string;
}

// Types de marché disponibles
enum MarketFormat {
  PERP = '{SYMBOL}-USD-PERP',
  SPOT = '{SYMBOL}-USD',
  BTC = '{SYMBOL}-BTC',
}

// Définit des plages de prix valides pour les tokens majeurs
interface PriceRange {
  min: number;    // Prix minimum acceptable (USD)
  max: number;    // Prix maximum acceptable (USD)
  typical: number; // Prix approximatif typique (pour référence)
}

export class PriceService {
  private static instance: PriceService;
  private priceCache: Map<string, CachedPrice> = new Map();
  private bboService: BBOService;
  
  // Durée maximale de validité du cache en millisecondes (30 minutes)
  private CACHE_EXPIRY_MS = 30 * 60 * 1000;
  
  // Nombre maximum de tentatives pour obtenir un prix
  private MAX_RETRY_ATTEMPTS = 3;
  
  // Délai entre les tentatives (en millisecondes)
  private RETRY_DELAY_MS = 1000;
  
  // Liste des formats de marché à essayer dans l'ordre
  private marketFormats: MarketFormat[] = [
    MarketFormat.PERP,
    MarketFormat.SPOT,
    MarketFormat.BTC,
  ];

  // Définir un prix par défaut pour certains tokens connus (en USD)
  private defaultPrices: Record<string, number> = {
    'USDC': 1,
    'USDT': 1,
    'DAI': 1,
    // On peut ajouter d'autres valeurs par défaut pour d'autres tokens en cas de besoin
  };
  
  // Définit des plages de prix acceptables pour des tokens majeurs
  // Utilisé pour filtrer les prix manifestement incorrects
  private tokenPriceRanges: Record<string, PriceRange> = {
    'BTC': { min: 20000, max: 200000, typical: 100000 },
    'ETH': { min: 1000, max: 10000, typical: 3000 },
    'SOL': { min: 20, max: 500, typical: 150 },
    'DOGE': { min: 0.05, max: 1, typical: 0.15 },
    'AVAX': { min: 10, max: 200, typical: 40 },
    'MATIC': { min: 0.3, max: 3, typical: 0.8 }
  };
  
  // Liste des sources de marché à exclure (options, marchés non fiables, etc.)
  private excludedMarketPatterns: RegExp[] = [
    /-USD-\d+-(C|P)$/, // Exclut les contrats d'options (call/put)
    /-USDT$/,          // Préfère les paires en USD plutôt qu'en USDT
    /-\d{5,}$/         // Exclut les marchés avec grands nombres (souvent des futures lointains)
  ];

  private constructor() {
    this.bboService = new BBOService();
  }

  /**
   * Obtient l'instance singleton du PriceService
   * @returns L'instance du PriceService
   */
  public static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  /**
   * Récupère le prix d'un token, avec gestion de cache et fallback
   * @param symbol Symbole du token (ex: "ETH", "BTC")
   * @param config Configuration système pour l'API
   * @param forceFresh Forcer le rafraîchissement du cache
   * @returns Prix en USD ou undefined si impossible à obtenir
   */
  public async getTokenPrice(
    symbol: string,
    config: SystemConfig,
    forceFresh = false
  ): Promise<number | undefined> {
    // Tokens stables connus
    if (this.defaultPrices[symbol] !== undefined) {
      return this.defaultPrices[symbol];
    }
    
    // Check if the token is supported by Paradex before attempting to fetch price
    const symbolUpper = symbol.toUpperCase();
    const tokenValidation = validateSupportedToken(symbolUpper);
    
    if (!tokenValidation.isSupported) {
      console.error(`Token ${symbol} is not supported on Paradex. Cannot fetch price.`);
      console.error(tokenValidation.message);
      return undefined;
    }

    const cacheKey = symbolUpper;
    const cachedData = this.priceCache.get(cacheKey);

    // Vérifier si nous avons un prix en cache valide et pas de forçage de rafraîchissement
    if (
      !forceFresh &&
      cachedData &&
      Date.now() - cachedData.timestamp < this.CACHE_EXPIRY_MS
    ) {
      console.log(`Using cached price for ${symbol}: $${cachedData.price} (from ${cachedData.source})`);
      
      // Vérifier que le prix en cache est dans les plages acceptables pour les tokens majeurs
      if (this.isPriceReasonable(symbolUpper, cachedData.price)) {
        return cachedData.price;
      } else {
        console.warn(`⚠️ WARNING: Cached price for ${symbol} ($${cachedData.price}) is outside reasonable range. Forcing refresh.`);
        // Continue pour forcer un rafraîchissement
      }
    }

    // Essayer d'obtenir un prix frais
    const freshPrice = await this.fetchFreshPrice(symbol, config);
    
    if (freshPrice !== undefined) {
      // Vérifier si le nouveau prix est raisonnable
      if (this.isPriceReasonable(symbolUpper, freshPrice.price)) {
        // Mise à jour du cache avec le nouveau prix
        this.priceCache.set(cacheKey, {
          price: freshPrice.price,
          timestamp: Date.now(),
          source: freshPrice.source,
        });
        return freshPrice.price;
      } else {
        console.warn(`⚠️ WARNING: Rejected unreasonable price for ${symbol}: $${freshPrice.price} (from ${freshPrice.source})`);
        
        // Si nous avons un prix précédent qui était raisonnable, l'utiliser comme fallback
        if (cachedData && this.isPriceReasonable(symbolUpper, cachedData.price)) {
          console.warn(`Using previous cached price: $${cachedData.price} (from ${cachedData.source})`);
          return cachedData.price;
        }
        
        // Sinon, utiliser un prix typique si disponible
        if (this.tokenPriceRanges[symbolUpper]) {
          const typicalPrice = this.tokenPriceRanges[symbolUpper].typical;
          console.warn(`Using typical reference price for ${symbol}: $${typicalPrice}`);
          
          // Mettre en cache le prix typique
          this.priceCache.set(cacheKey, {
            price: typicalPrice,
            timestamp: Date.now(),
            source: 'reference_value',
          });
          
          return typicalPrice;
        }
      }
    }

    // Si nous n'avons pas pu obtenir un prix frais, mais que nous avons un prix en cache (même expiré)
    // nous l'utilisons comme fallback si raisonnable
    if (cachedData && this.isPriceReasonable(symbolUpper, cachedData.price)) {
      console.warn(`Using expired cached price for ${symbol}: $${cachedData.price} (from ${cachedData.source}, age: ${this.formatAge(Date.now() - cachedData.timestamp)})`);
      return cachedData.price;
    }
    
    // Dernier recours : utiliser une valeur typique si disponible
    if (this.tokenPriceRanges[symbolUpper]) {
      const typicalPrice = this.tokenPriceRanges[symbolUpper].typical;
      console.warn(`Using typical reference price for ${symbol} as last resort: $${typicalPrice}`);
      return typicalPrice;
    }

    // Si tout échoue, nous n'avons pas de prix
    console.error(`Could not get any reliable price for ${symbol} after trying all methods`);
    return undefined;
  }

  /**
   * Vérifie si un prix est dans une plage raisonnable pour un token donné
   * @param symbol Symbole du token
   * @param price Prix à vérifier
   * @returns true si le prix est raisonnable, false sinon
   */
  private isPriceReasonable(symbol: string, price: number): boolean {
    const symbolUpper = symbol.toUpperCase();
    
    // Si nous avons des plages définies pour ce token, vérifier
    if (this.tokenPriceRanges[symbolUpper]) {
      const range = this.tokenPriceRanges[symbolUpper];
      
      // Si le prix est hors de la plage acceptée
      if (price < range.min || price > range.max) {
        console.warn(`Price for ${symbol} ($${price}) is outside reasonable range: $${range.min} - $${range.max}`);
        return false;
      }
    }
    
    // Pour les autres tokens, accepter des prix entre $0.00001 et $10,000
    // (Plage très large pour les tokens sans référence spécifique)
    if (price <= 0 || price > 10000) {
      // Sauf pour BTC qui peut dépasser 10,000
      if (symbolUpper !== 'BTC' || price <= 0) {
        console.warn(`Price for ${symbol} ($${price}) is outside general acceptable range`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Vérifie si une source de marché doit être exclue
   * @param market Nom du marché
   * @returns true si le marché doit être exclu
   */
  private shouldExcludeMarket(market: string): boolean {
    // Vérifier si le marché correspond à l'un des patterns à exclure
    for (const pattern of this.excludedMarketPatterns) {
      if (pattern.test(market)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Tente d'obtenir un prix frais en utilisant différentes méthodes
   * @param symbol Symbole du token
   * @param config Configuration système
   * @returns Objet contenant le prix et sa source, ou undefined
   */
  private async fetchFreshPrice(
    symbol: string,
    config: SystemConfig
  ): Promise<{ price: number; source: string } | undefined> {
    const symbolUpper = symbol.toUpperCase();
    
    // Check if we have known markets for this token in our cache
    const knownMarkets = getMarketsForToken(symbolUpper);
    if (knownMarkets && knownMarkets.length > 0) {
      // Filtrer les marchés à exclure
      const filteredMarkets = knownMarkets.filter(market => !this.shouldExcludeMarket(market));
      
      if (filteredMarkets.length > 0) {
        console.log(`Using ${filteredMarkets.length} filtered markets for ${symbolUpper} (from ${knownMarkets.length} total markets)`);
      } else {
        console.warn(`⚠️ All ${knownMarkets.length} known markets for ${symbolUpper} were filtered out. Using original list.`);
        // Si tous les marchés sont filtrés, utiliser la liste originale
        // mais privilégier les marchés spot
      }
      
      const marketsToUse = filteredMarkets.length > 0 ? filteredMarkets : knownMarkets;
      
      // Prioriser les marchés spot (sans suffixe -PERP ou autres)
      const spotMarkets = marketsToUse.filter(m => m.includes('-USD') && !m.includes('-USD-'));
      const perpMarkets = marketsToUse.filter(m => m.includes('-USD-PERP'));
      const otherUsdMarkets = marketsToUse.filter(m => m.includes('-USD') && !spotMarkets.includes(m) && !perpMarkets.includes(m));
      
      // Ordre de priorité : spot > perp > autres USD > BTC
      const prioritizedUsdMarkets = [...spotMarkets, ...perpMarkets, ...otherUsdMarkets];
      
      if (prioritizedUsdMarkets.length > 0) {
        // Try each prioritized USD market
        for (const market of prioritizedUsdMarkets) {
          for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
            try {
              const bboData = await this.bboService.fetchMarketBBO(config, market);
              
              if (bboData?.bid) {
                const price = parseFloat(bboData.bid);
                if (!isNaN(price) && price > 0) {
                  console.log(`Got price for ${symbol} from market ${market}: $${price} (attempt ${attempt})`);
                  
                  // Vérifier que le prix est dans une plage raisonnable
                  if (this.isPriceReasonable(symbolUpper, price)) {
                    return { price, source: market };
                  } else {
                    console.warn(`⚠️ Rejected unreasonable price for ${symbol} from ${market}: $${price}`);
                    // Continuer à chercher un prix plus raisonnable
                  }
                }
              }
              
              if (!bboData?.bid && bboData?.ask) {
                const askPrice = parseFloat(bboData.ask);
                if (!isNaN(askPrice) && askPrice > 0) {
                  const estimatedBid = askPrice * 0.995;
                  console.log(`Using adjusted ask price for ${symbol} from market ${market}: $${estimatedBid} (from ask ${askPrice}, attempt ${attempt})`);
                  
                  // Vérifier que le prix estimé est dans une plage raisonnable
                  if (this.isPriceReasonable(symbolUpper, estimatedBid)) {
                    return { price: estimatedBid, source: `${market} (adjusted ask)` };
                  } else {
                    console.warn(`⚠️ Rejected unreasonable adjusted price for ${symbol} from ${market}: $${estimatedBid}`);
                    // Continuer à chercher un prix plus raisonnable
                  }
                }
              }
            } catch (error) {
              console.warn(`Error fetching market ${market} on attempt ${attempt}:`, error);
              
              if (attempt < this.MAX_RETRY_ATTEMPTS) {
                await this.sleep(this.RETRY_DELAY_MS);
              }
            }
          }
        }
      }
      
      // Si USD markets ont échoué ou étaient déraisonnables, essayer BTC markets en dernier recours
      const btcMarkets = marketsToUse.filter(m => m.includes('-BTC'));
      if (btcMarkets.length > 0) {
        // Récupérer le prix BTC de manière récursive, mais avec vérification pour éviter boucle infinie
        if (symbolUpper !== 'BTC') {
          const btcPrice = await this.getTokenPrice('BTC', config);
          if (btcPrice && this.isPriceReasonable('BTC', btcPrice)) {
            // Try each known BTC market
            for (const market of btcMarkets) {
              for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                  const bboData = await this.bboService.fetchMarketBBO(config, market);
                  
                  if (bboData?.bid) {
                    const priceBTC = parseFloat(bboData.bid);
                    if (!isNaN(priceBTC) && priceBTC > 0) {
                      const priceUSD = priceBTC * btcPrice;
                      console.log(`Got price for ${symbol} from BTC market ${market}: ${priceBTC} BTC = $${priceUSD} (attempt ${attempt})`);
                      
                      // Vérifier que le prix converti est dans une plage raisonnable
                      if (this.isPriceReasonable(symbolUpper, priceUSD)) {
                        return { price: priceUSD, source: `${market} (via BTC)` };
                      } else {
                        console.warn(`⚠️ Rejected unreasonable BTC-derived price for ${symbol} from ${market}: $${priceUSD}`);
                        // Continuer à chercher un prix plus raisonnable
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`Error fetching BTC market ${market} on attempt ${attempt}:`, error);
                  
                  if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    await this.sleep(this.RETRY_DELAY_MS);
                  }
                }
              }
            }
          } else {
            console.warn(`Could not get reliable BTC price for conversion: ${btcPrice}`);
          }
        }
      }
    }
    
    // Fallback: try generic market formats if no known markets worked
    console.log(`No known markets found or all yielded unreasonable prices for ${symbol}, trying generic market formats`);
    
    // 1. Essayer chaque format de marché
    for (const formatTemplate of this.marketFormats) {
      const market = formatTemplate.replace('{SYMBOL}', symbol);
      
      // Skip excluded market patterns
      if (this.shouldExcludeMarket(market)) {
        console.log(`Skipping excluded market pattern: ${market}`);
        continue;
      }
      
      // 2. Essayer plusieurs fois avec le même format si nécessaire
      for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const bboData = await this.bboService.fetchMarketBBO(config, market);
          
          // Pour la valorisation du portefeuille, nous utilisons le bid (prix de vente)
          if (bboData?.bid) {
            const price = parseFloat(bboData.bid);
            if (!isNaN(price) && price > 0) {
              console.log(`Got price for ${symbol} from ${market}: $${price} (attempt ${attempt})`);
              
              // Vérifier que le prix est dans une plage raisonnable
              if (this.isPriceReasonable(symbolUpper, price)) {
                return { price, source: market };
              } else {
                console.warn(`⚠️ Rejected unreasonable price for ${symbol} from ${market}: $${price}`);
                // Continuer à chercher un prix plus raisonnable
              }
            }
          }
          
          // Si le bid n'est pas disponible mais ask l'est, on peut utiliser ask avec une petite décote
          if (!bboData?.bid && bboData?.ask) {
            const askPrice = parseFloat(bboData.ask);
            if (!isNaN(askPrice) && askPrice > 0) {
              // Décote de 0.5% pour simuler un bid
              const estimatedBid = askPrice * 0.995;
              console.log(`Using adjusted ask price for ${symbol} from ${market}: $${estimatedBid} (from ask ${askPrice}, attempt ${attempt})`);
              
              // Vérifier que le prix estimé est dans une plage raisonnable
              if (this.isPriceReasonable(symbolUpper, estimatedBid)) {
                return { price: estimatedBid, source: `${market} (adjusted ask)` };
              } else {
                console.warn(`⚠️ Rejected unreasonable adjusted price for ${symbol} from ${market}: $${estimatedBid}`);
                // Continuer à chercher un prix plus raisonnable
              }
            }
          }
        } catch (error) {
          console.warn(`Error fetching ${market} on attempt ${attempt}:`, error);
          
          // Si ce n'est pas la dernière tentative, attendre avant de réessayer
          if (attempt < this.MAX_RETRY_ATTEMPTS) {
            await this.sleep(this.RETRY_DELAY_MS);
          }
        }
      }
    }

    // 3. Aucun des formats n'a fonctionné ou n'a fourni un prix raisonnable
    return undefined;
  }

  /**
   * Utilité pour pause entre les tentatives
   * @param ms Durée de pause en millisecondes
   * @returns Promise résolue après la pause
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Formatte un âge en millisecondes en format lisible
   * @param ms Age en millisecondes
   * @returns Age formaté en texte
   */
  private formatAge(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  /**
   * Réinitialise le cache pour un token spécifique ou pour tous les tokens
   * @param symbol Symbole du token à réinitialiser (optionnel, tous les tokens si non spécifié)
   */
  public clearCache(symbol?: string): void {
    if (symbol) {
      const symbolUpper = symbol.toUpperCase();
      this.priceCache.delete(symbolUpper);
      console.log(`Cleared price cache for ${symbolUpper}`);
    } else {
      this.priceCache.clear();
      console.log('Cleared all price cache');
    }
  }

  /**
   * Obtient l'état actuel du cache pour diagnostic
   * @returns Copie du cache actuel
   */
  public getCacheStatus(): Record<string, { price: number; age: string; source: string }> {
    const result: Record<string, { price: number; age: string; source: string }> = {};
    const now = Date.now();
    
    for (const [token, data] of this.priceCache.entries()) {
      result[token] = {
        price: data.price,
        age: this.formatAge(now - data.timestamp),
        source: data.source
      };
    }
    
    return result;
  }
} 