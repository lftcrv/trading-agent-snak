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

  private constructor() {
    this.bboService = new BBOService();
  }

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
      return cachedData.price;
    }

    // Essayer d'obtenir un prix frais
    const freshPrice = await this.fetchFreshPrice(symbol, config);
    
    if (freshPrice !== undefined) {
      // Mise à jour du cache avec le nouveau prix
      this.priceCache.set(cacheKey, {
        price: freshPrice.price,
        timestamp: Date.now(),
        source: freshPrice.source,
      });
      return freshPrice.price;
    }

    // Si nous n'avons pas pu obtenir un prix frais, mais que nous avons un prix en cache (même expiré)
    // nous l'utilisons comme fallback
    if (cachedData) {
      console.warn(`Using expired cached price for ${symbol}: $${cachedData.price} (from ${cachedData.source}, age: ${this.formatAge(Date.now() - cachedData.timestamp)})`);
      return cachedData.price;
    }

    // Si tout échoue, nous n'avons pas de prix
    console.error(`Could not get any price for ${symbol} after trying all methods`);
    return undefined;
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
      console.log(`Using ${knownMarkets.length} known markets for ${symbolUpper}: ${knownMarkets.join(', ')}`);
      
      // First try known USD markets
      const usdMarkets = knownMarkets.filter(m => m.includes('-USD'));
      if (usdMarkets.length > 0) {
        // Try each known USD market
        for (const market of usdMarkets) {
          for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
            try {
              const bboData = await this.bboService.fetchMarketBBO(config, market);
              
              if (bboData?.bid) {
                const price = parseFloat(bboData.bid);
                if (!isNaN(price) && price > 0) {
                  console.log(`Got price for ${symbol} from known market ${market}: $${price} (attempt ${attempt})`);
                  return { price, source: market };
                }
              }
              
              if (!bboData?.bid && bboData?.ask) {
                const askPrice = parseFloat(bboData.ask);
                if (!isNaN(askPrice) && askPrice > 0) {
                  const estimatedBid = askPrice * 0.995;
                  console.log(`Using adjusted ask price for ${symbol} from known market ${market}: $${estimatedBid} (from ask ${askPrice}, attempt ${attempt})`);
                  return { price: estimatedBid, source: `${market} (adjusted ask)` };
                }
              }
            } catch (error) {
              console.warn(`Error fetching known market ${market} on attempt ${attempt}:`, error);
              
              if (attempt < this.MAX_RETRY_ATTEMPTS) {
                await this.sleep(this.RETRY_DELAY_MS);
              }
            }
          }
        }
      }
      
      // If USD markets failed, try BTC markets (we'll need to get BTC price first)
      const btcMarkets = knownMarkets.filter(m => m.includes('-BTC'));
      if (btcMarkets.length > 0) {
        // Get BTC price first
        const btcPrice = await this.getTokenPrice('BTC', config);
        if (btcPrice) {
          // Try each known BTC market
          for (const market of btcMarkets) {
            for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
              try {
                const bboData = await this.bboService.fetchMarketBBO(config, market);
                
                if (bboData?.bid) {
                  const priceBTC = parseFloat(bboData.bid);
                  if (!isNaN(priceBTC) && priceBTC > 0) {
                    const priceUSD = priceBTC * btcPrice;
                    console.log(`Got price for ${symbol} from known BTC market ${market}: ${priceBTC} BTC = $${priceUSD} (attempt ${attempt})`);
                    return { price: priceUSD, source: `${market} (via BTC)` };
                  }
                }
              } catch (error) {
                console.warn(`Error fetching known BTC market ${market} on attempt ${attempt}:`, error);
                
                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                  await this.sleep(this.RETRY_DELAY_MS);
                }
              }
            }
          }
        }
      }
    }
    
    // Fallback: try generic market formats if no known markets worked
    console.log(`No known markets found or available for ${symbol}, trying generic market formats`);
    
    // 1. Essayer chaque format de marché
    for (const formatTemplate of this.marketFormats) {
      const market = formatTemplate.replace('{SYMBOL}', symbol);
      
      // 2. Essayer plusieurs fois avec le même format si nécessaire
      for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const bboData = await this.bboService.fetchMarketBBO(config, market);
          
          // Pour la valorisation du portefeuille, nous utilisons le bid (prix de vente)
          if (bboData?.bid) {
            const price = parseFloat(bboData.bid);
            if (!isNaN(price) && price > 0) {
              console.log(`Got price for ${symbol} from ${market}: $${price} (attempt ${attempt})`);
              return { price, source: market };
            }
          }
          
          // Si le bid n'est pas disponible mais ask l'est, on peut utiliser ask avec une petite décote
          if (!bboData?.bid && bboData?.ask) {
            const askPrice = parseFloat(bboData.ask);
            if (!isNaN(askPrice) && askPrice > 0) {
              // Décote de 0.5% pour simuler un bid
              const estimatedBid = askPrice * 0.995;
              console.log(`Using adjusted ask price for ${symbol} from ${market}: $${estimatedBid} (from ask ${askPrice}, attempt ${attempt})`);
              return { price: estimatedBid, source: `${market} (adjusted ask)` };
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

    // 3. Aucun des formats n'a fonctionné, retourner undefined
    return undefined;
  }

  /**
   * Mettre à jour les prix dans le cache manuellement (utile pour des sources alternatives)
   */
  public updateCachePrice(symbol: string, price: number, source: string): void {
    this.priceCache.set(symbol.toUpperCase(), {
      price,
      timestamp: Date.now(),
      source,
    });
  }

  /**
   * Effacer le cache ou une entrée spécifique
   */
  public clearCache(symbol?: string): void {
    if (symbol) {
      this.priceCache.delete(symbol.toUpperCase());
    } else {
      this.priceCache.clear();
    }
  }

  /**
   * Obtenir toutes les entrées du cache
   */
  public getCacheEntries(): [string, CachedPrice][] {
    return Array.from(this.priceCache.entries());
  }

  /**
   * Utilitaire pour mettre en pause l'exécution
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Formater l'âge d'une entrée en cache pour affichage
   */
  private formatAge(ageMs: number): string {
    if (ageMs < 60000) {
      return `${Math.floor(ageMs / 1000)}s`;
    } else if (ageMs < 3600000) {
      return `${Math.floor(ageMs / 60000)}m`;
    } else {
      return `${Math.floor(ageMs / 3600000)}h`;
    }
  }
} 