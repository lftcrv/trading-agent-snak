import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { ListMarketResponse } from '@starknet-agent-kit/plugin-paradex/dist/interfaces/results.js';
import { 
  PARADEX_SUPPORTED_TOKENS, 
  updateSupportedTokensCache,
  updateTradableMarketsCache
} from '../../utils/validateSupportedToken.js';

interface SupportedTokensResponse {
  success: boolean;
  tokens: string[];
  message: string;
  source?: string; // Indicates if the list came from API or fallback
  tradableTokens?: string[]; // Tokens with active markets
  markets?: {[token: string]: string[]}; // Markets associated with each token
}

/**
 * A market record containing token and market information
 */
interface TokenMarketInfo {
  token: string;      // Token symbol
  markets: string[];  // List of markets where this token can be traded
}

/**
 * Extracts tradable token information from market symbols
 * @param markets Array of market symbols (e.g. "BTC-USD-PERP")
 * @returns Object with tokens and their associated markets
 */
function extractTradableTokenInfo(markets: string[]): {
  allTokens: string[];
  tradableTokens: string[];
  tokenMarkets: {[token: string]: string[]};
} {
  const tokenSet = new Set<string>();
  const tokenMarkets: {[token: string]: string[]} = {};
  
  // First pass: collect all tokens and their markets
  markets.forEach(market => {
    const parts = market.split('-');
    if (parts.length > 0) {
      const token = parts[0];
      tokenSet.add(token);
      
      if (!tokenMarkets[token]) {
        tokenMarkets[token] = [];
      }
      tokenMarkets[token].push(market);
    }
  });
  
  // Second pass: determine which tokens are actually tradable
  // A token is tradable if it has at least one market with USD or BTC
  const tradableTokens = Object.keys(tokenMarkets).filter(token => {
    return tokenMarkets[token].some(market => 
      market.includes('-USD') || market.includes('-BTC') || 
      market.includes('/USD') || market.includes('/BTC')
    );
  });
  
  return {
    allTokens: Array.from(tokenSet).sort(),
    tradableTokens: tradableTokens.sort(),
    tokenMarkets
  };
}

/**
 * Returns a list of tokens supported for trading on Paradex
 * This helps the agent avoid attempting to trade unsupported tokens
 */
export const listSupportedTokens = async (
  agent: StarknetAgentInterface
): Promise<SupportedTokensResponse> => {
  try {
    console.log('Fetching supported tokens on Paradex...');
    
    // Get Paradex configuration
    const config = await getParadexConfig();
    
    // Fetch available markets from Paradex API
    const url = `${config.apiBaseUrl}/markets`;
    console.log('Requesting markets from:', url);
    
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch markets: ${response.status}`);
    }
    
    const data = await response.json() as ListMarketResponse;
    const marketSymbols = data.results.map(market => market.symbol);
    
    // Extract tokens and their markets
    const { allTokens, tradableTokens, tokenMarkets } = extractTradableTokenInfo(marketSymbols);
    
    console.log(`Found ${allTokens.length} tokens on Paradex, of which ${tradableTokens.length} have active trading markets`);
    
    // Print the untradable tokens for debugging
    const untradableTokens = allTokens.filter(token => !tradableTokens.includes(token));
    if (untradableTokens.length > 0) {
      console.log(`WARNING: ${untradableTokens.length} tokens do not have active USD or BTC markets: ${untradableTokens.join(', ')}`);
    }
    
    // Update the cache for future token validations
    updateSupportedTokensCache(tradableTokens);
    updateTradableMarketsCache(tokenMarkets);
    
    const result: SupportedTokensResponse = {
      success: true,
      tokens: allTokens,
      tradableTokens: tradableTokens,
      markets: tokenMarkets,
      message: `Paradex supports trading with the following tokens: ${tradableTokens.join(', ')}`,
      source: 'api'
    };
    
    console.log(result.message);
    return result;
  } catch (error) {
    console.error('Error fetching supported tokens from Paradex API:', error);
    console.warn('Falling back to hardcoded token list');
    
    // Fallback to hardcoded list if API call fails
    return {
      success: false,
      tokens: [...PARADEX_SUPPORTED_TOKENS],
      message: `Could not fetch tokens from Paradex API. Using fallback list: ${PARADEX_SUPPORTED_TOKENS.join(', ')}`,
      source: 'fallback'
    };
  }
}; 