import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { PriceService } from '../services/PriceService.js';

/**
 * Gets the price of a token in USD using the LeftCurve API
 * @param symbol The token symbol
 * @returns The token price in USD
 */
export const getTokenPrice = async (symbol: string): Promise<number> => {
  try {
    // USDC is always 1.0
    if (symbol.toUpperCase() === 'USDC') {
      return 1.0;
    }
    
    // Use the PriceService to get the price from the LeftCurve API
    const priceService = PriceService.getInstance();
    const price = await priceService.getTokenPrice(symbol);
    
    if (price !== undefined) {
      return price;
    } else {
      console.warn(`⚠️ Could not get price for ${symbol} from API, using 1.0`);
      return 1.0;
    }
    
  } catch (error) {
    console.warn(`⚠️ Could not get price for ${symbol}, using 1.0:`, error);
    return 1.0;
  }
}; 