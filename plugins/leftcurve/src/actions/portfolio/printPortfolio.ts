import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getPortfolioTokens } from '../../utils/getPortfolioTokens.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { getTokenPrice } from '../../utils/getTokenPrice.js';
import { getTokenAllocation } from '../../utils/tokenAllocation.js';
import { formatAgentResponse } from '../../utils/formatAgentResponse.js';

interface TokenData {
  symbol: string;
  balance: number;
  price: number;
  value: number;
  allocation: number;
  targetAllocation?: number;
  deviation?: number;
}

interface DeviationData {
  symbol: string;
  currentAllocation: number;
  targetAllocation: number;
  deviation: number;
  action: string;
  description: string;
}

interface PortfolioData {
  totalValue: number;
  tokens: TokenData[];
  hasTargetAllocations: boolean;
  targetAllocations: any[];
  significantDeviations: DeviationData[];
}

/**
 * Prints the current portfolio holdings
 * @param agent The Starknet agent
 * @returns A formatted JSON string with the portfolio details
 */
export const printPortfolio = async (
  agent: StarknetAgentInterface
): Promise<string> => {
  try {
    console.log('📊 PORTFOLIO: Fetching portfolio tokens...');
    
    // Get portfolio tokens
    const tokens = await getPortfolioTokens(agent);
    
    if (!tokens || tokens.length === 0) {
      return formatAgentResponse({
        status: 'error',
        message: 'No tokens found in portfolio.'
      }, 'portfolio');
    }
    
    // Get target allocations if they exist
    const targetAllocations = await getTokenAllocation(agent);
    
    // Calculate values and percentages
    let totalValue = 0;
    const tokenData: TokenData[] = [];
    
    // First pass: calculate total value
    for (const token of tokens) {
      const price = await getTokenPrice(token.symbol);
      const value = token.balance * price;
      totalValue += value;
    }
    
    // Second pass: calculate percentages and create token data objects
    for (const token of tokens) {
      const price = await getTokenPrice(token.symbol);
      const value = token.balance * price;
      const allocation = (value / totalValue) * 100;
      
      // Find target allocation for this token if it exists
      const targetAllocation = targetAllocations?.find(
        t => t.symbol.toUpperCase() === token.symbol.toUpperCase()
      )?.percentage;
      
      // Calculate deviation if target allocation exists
      const deviation = targetAllocation !== undefined 
        ? allocation - targetAllocation 
        : undefined;
      
      tokenData.push({
        symbol: token.symbol,
        balance: token.balance,
        price,
        value,
        allocation,
        targetAllocation,
        deviation
      });
    }
    
    // Sort tokens by value (descending)
    tokenData.sort((a, b) => b.value - a.value);
    
    // Check if target allocations exist and have values
    const hasTargetAllocations = !!(targetAllocations && targetAllocations.length > 0);
    
    // Create a structured response object
    const portfolioData: PortfolioData = {
      totalValue,
      tokens: tokenData,
      hasTargetAllocations,
      targetAllocations: targetAllocations || [],
      significantDeviations: []
    };
    
    // Add recommendation if there are significant deviations
    if (hasTargetAllocations) {
      const significantDeviations: DeviationData[] = tokenData
        .filter(t => t.deviation !== undefined && Math.abs(t.deviation) > 5)
        .sort((a, b) => Math.abs(b.deviation!) - Math.abs(a.deviation!))
        .map(token => ({
          symbol: token.symbol,
          currentAllocation: token.allocation,
          targetAllocation: token.targetAllocation!,
          deviation: token.deviation!,
          action: token.deviation! > 5 ? 'REDUCE' : 'INCREASE',
          description: token.deviation! > 5 
            ? `REDUCE ${token.symbol}: Currently ${token.allocation.toFixed(2)}%, target ${token.targetAllocation!.toFixed(2)}% (${token.deviation!.toFixed(2)}% overweight)`
            : `INCREASE ${token.symbol}: Currently ${token.allocation.toFixed(2)}%, target ${token.targetAllocation!.toFixed(2)}% (${Math.abs(token.deviation!).toFixed(2)}% underweight)`
        }));
      
      portfolioData.significantDeviations = significantDeviations;
    }
    
    // Print to console using the same JSON format
    console.log(formatAgentResponse(portfolioData, 'portfolio'));
    
    // Return the JSON-formatted data
    return formatAgentResponse(portfolioData, 'portfolio');
    
  } catch (error) {
    console.error('❌ Error printing portfolio:', error);
    return formatAgentResponse({
      status: 'error',
      message: 'Error printing portfolio. Please try again.',
      error: error.message
    }, 'portfolio');
  }
};
