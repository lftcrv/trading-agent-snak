import { SystemConfig } from '../interfaces/config.js';
import { CachedPrice, TokenPriceResponse } from '../interfaces/results.js';

// Définit des plages de prix valides pour les tokens majeurs
interface PriceRange {
  min: number;    // Prix minimum acceptable (USD)
  max: number;    // Prix maximum acceptable (USD)
  typical: number; // Prix approximatif typique (pour référence)
}

export class PriceService {
  private static instance: PriceService;
  private priceCache: Map<string, CachedPrice> = new Map();
  
  // URL de l'API LeftCurve pour les prix
  private PRICE_API_URL = 'http://13.38.118.193:8080/api/token-master/prices/by-symbols/';
  
  // Clé API pour accéder à l'API LeftCurve
  private API_KEY = 'WcmZV.MLUM69s@pDNwwxbLTiH';
  
  // Durée maximale de validité du cache en millisecondes (30 minutes)
  private CACHE_EXPIRY_MS = 30 * 60 * 1000;
  
  // Nombre maximum de tentatives pour obtenir un prix
  private MAX_RETRY_ATTEMPTS = 3;
  
  // Délai entre les tentatives (en millisecondes)
  private RETRY_DELAY_MS = 1000;
  
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
    'BTC': { min: 20000, max: 500000, typical: 100000 },
    'ETH': { min: 1000, max: 20000, typical: 3000 },
    'SOL': { min: 20, max: 1000, typical: 150 },
    'DOGE': { min: 0.05, max: 2, typical: 0.15 },
    'AVAX': { min: 10, max: 500, typical: 40 },
    'MATIC': { min: 0.3, max: 5, typical: 0.8 }
  };

  private constructor() {}

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
   * @param config Configuration système pour l'API (non utilisé avec la nouvelle API)
   * @param forceFresh Forcer le rafraîchissement du cache
   * @returns Prix en USD ou undefined si impossible à obtenir
   */
  public async getTokenPrice(
    symbol: string,
    config?: SystemConfig,
    forceFresh = false
  ): Promise<number | undefined> {
    // Tokens stables connus
    if (this.defaultPrices[symbol] !== undefined) {
      return this.defaultPrices[symbol];
    }
    
    const symbolUpper = symbol.toUpperCase();
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
    const freshPrice = await this.fetchFreshPrice(symbolUpper);
    
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
    
    // Pour les autres tokens, accepter des prix entre $0.00001 et $100,000
    // (Plage très large pour les tokens sans référence spécifique)
    if (price <= 0 || price > 100000) {
      // Sauf pour BTC qui peut dépasser 100,000
      if (symbolUpper !== 'BTC' || price <= 0) {
        console.warn(`Price for ${symbol} ($${price}) is outside general acceptable range`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Tente d'obtenir un prix frais en utilisant l'API LeftCurve
   * @param symbol Symbole du token
   * @returns Objet contenant le prix et sa source, ou undefined
   */
  private async fetchFreshPrice(
    symbol: string
  ): Promise<{ price: number; source: string } | undefined> {
    const symbolUpper = symbol.toUpperCase();
    
    // Essayer d'obtenir le prix depuis l'API LeftCurve
    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Encodage du symbole pour l'URL
        const encodedSymbol = encodeURIComponent(symbolUpper);
        const apiUrl = `${this.PRICE_API_URL}${encodedSymbol}`;
        
        console.log(`Fetching price for ${symbolUpper} from LeftCurve API (attempt ${attempt}): ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'api-key': this.API_KEY
          }
        });
        
        if (!response.ok) {
          throw new Error(`API returned status ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json() as TokenPriceResponse[];
        
        // Trouver le prix pour notre symbole
        const tokenData = data.find(item => item.canonicalSymbol.toUpperCase() === symbolUpper);
        
        if (tokenData && typeof tokenData.priceUSD === 'number' && tokenData.priceUSD > 0) {
          console.log(`Got price for ${symbolUpper} from LeftCurve API: $${tokenData.priceUSD}`);
          return {
            price: tokenData.priceUSD,
            source: 'leftcurve_api'
          };
        } else {
          console.warn(`Token ${symbolUpper} not found in API response or has invalid price`);
        }
      } catch (error) {
        console.warn(`Error fetching price for ${symbolUpper} on attempt ${attempt}:`, error);
        
        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          await this.sleep(this.RETRY_DELAY_MS);
        }
      }
    }
    
    // Si on a épuisé toutes les tentatives sans succès
    console.error(`Failed to get price for ${symbolUpper} after ${this.MAX_RETRY_ATTEMPTS} attempts`);
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