// FALLBACK list of tokens that might be supported on Paradex for trading
// This list is NOT GUARANTEED to be complete or up-to-date
// ALWAYS use the listSupportedTokens function to get the current list from the API
export const PARADEX_SUPPORTED_TOKENS = [
  'BTC',
  'ETH',
  'STRK',
  'LORDS',
  'USDT',
  'USDC',
  'WBTC',
  'UNI',
  'DAI',
  'rETH',
  'LUSD',
  'xSTRK',
  'NSTR',
  'ZEND',
  'SWAY',
  'SSTR',
  'wstETH',
  'BROTHER'
];

// Cache for dynamically retrieved supported tokens
let dynamicTokensCache: string[] | null = null;
// Cache for tokens with active markets
let tradableTokensCache: string[] | null = null;
// Cache for market information by token
let tokenMarketsCache: {[token: string]: string[]} | null = null;
let cacheTimestamp: number = 0;
const CACHE_VALIDITY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Updates the cache of supported tokens
 * @param tokens The list of tokens from the API
 */
export const updateSupportedTokensCache = (tokens: string[]) => {
  dynamicTokensCache = tokens;
  cacheTimestamp = Date.now();
};

/**
 * Updates the cache of tradable markets for each token
 * @param markets Object mapping token symbols to their available markets
 */
export const updateTradableMarketsCache = (markets: {[token: string]: string[]}) => {
  tokenMarketsCache = markets;
  tradableTokensCache = Object.keys(markets).filter(token => 
    markets[token].some(market => 
      market.includes('-USD') || market.includes('-BTC') || 
      market.includes('/USD') || market.includes('/BTC')
    )
  );
  cacheTimestamp = Date.now();
};

/**
 * Checks if the token cache is still valid
 */
export const isCacheValid = (): boolean => {
  return dynamicTokensCache !== null && 
         (Date.now() - cacheTimestamp) < CACHE_VALIDITY_MS;
};

/**
 * Gets available markets for a token if they exist in the cache
 * @param token The token symbol
 * @returns Array of market symbols or null if not found
 */
export const getMarketsForToken = (token: string): string[] | null => {
  if (!isCacheValid() || !tokenMarketsCache) {
    return null;
  }
  
  const normalizedToken = token.toUpperCase();
  return tokenMarketsCache[normalizedToken] || null;
};

/**
 * Validates if a token is supported for trading on Paradex
 * @param token The token symbol to validate
 * @returns Object indicating if the token is supported with appropriate message
 */
export const validateSupportedToken = (token: string) => {
  const normalizedToken = token.toUpperCase();
  
  // First check tradable tokens cache if available
  if (isCacheValid() && tradableTokensCache) {
    const isSupported = tradableTokensCache.includes(normalizedToken);
    const markets = tokenMarketsCache?.[normalizedToken] || [];
    
    if (isSupported) {
      return {
        isSupported: true,
        message: `Token ${token} is supported on Paradex with ${markets.length} active markets`,
        markets
      };
    } else if (dynamicTokensCache?.includes(normalizedToken)) {
      // Token exists but doesn't have tradable markets
      return {
        isSupported: false,
        message: `Token ${token} exists on Paradex but does not have active USD or BTC markets for trading`,
        markets
      };
    } else {
      return {
        isSupported: false,
        message: `Token ${token} is not supported on Paradex. Please use list_supported_tokens for the current list.`,
        markets: []
      };
    }
  }
  
  // Fallback to hardcoded list
  const isSupported = PARADEX_SUPPORTED_TOKENS.includes(normalizedToken);
  
  return {
    isSupported,
    message: isSupported 
      ? `Token ${token} is supported on Paradex (based on fallback list)` 
      : `Token ${token} may not be supported on Paradex. Please use list_supported_tokens for the accurate list.`,
    markets: []
  };
}; 