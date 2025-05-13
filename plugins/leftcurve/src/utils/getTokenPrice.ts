import { StarknetAgentInterface } from '@starknet-agent-kit/agents';

/**
 * Gets the price of a token in USD
 * @param symbol The token symbol
 * @returns The token price in USD
 */
export const getTokenPrice = async (symbol: string): Promise<number> => {
  try {
    // USDC is always 1.0
    if (symbol.toUpperCase() === 'USDC') {
      return 1.0;
    }
    
    // Simple mock prices for common tokens
    // In a real implementation, these would come from an API or price oracle
    const mockPrices: Record<string, number> = {
      'BTC': 65000,
      'ETH': 3500,
      'DOGE': 0.15,
      'BOME': 0.05,
      'FARTCOIN': 0.001,
      'PNUT': 0.25,
      'GOAT': 0.75,
      'LINK': 15,
      'AAVE': 90,
      'UNI': 8,
      'SOL': 140,
      'AVAX': 35,
      'MATIC': 0.8,
      'DOT': 7,
      'ADA': 0.5,
      'XRP': 0.6
    };
    
    const upperSymbol = symbol.toUpperCase();
    
    // Return price from mock data or default to 1.0 if not available
    return mockPrices[upperSymbol] || 1.0;
    
  } catch (error) {
    console.warn(`⚠️ Could not get price for ${symbol}, using 1.0:`, error);
    return 1.0;
  }
}; 