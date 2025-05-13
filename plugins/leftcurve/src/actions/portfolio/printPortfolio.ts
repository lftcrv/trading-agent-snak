import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getPortfolioTokens } from '../../utils/getPortfolioTokens.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { getTokenPrice } from '../../utils/getTokenPrice.js';
import { getTokenAllocation } from '../../utils/tokenAllocation.js';

interface TokenData {
  symbol: string;
  balance: number;
  price: number;
  value: number;
  allocation: number;
  targetAllocation?: number;
  deviation?: number;
}

/**
 * Prints the current portfolio holdings
 * @param agent The Starknet agent
 * @returns A formatted string with the portfolio details
 */
export const printPortfolio = async (
  agent: StarknetAgentInterface
): Promise<string> => {
  try {
    console.log('📊 PORTFOLIO: Fetching portfolio tokens...');
    
    // Get portfolio tokens
    const tokens = await getPortfolioTokens(agent);
    
    if (!tokens || tokens.length === 0) {
      return '❌ No tokens found in portfolio.';
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
    
    // Format the output
    let output = '📊 CURRENT PORTFOLIO ALLOCATION:\n\n';
    
    // Header
    output += '| Token | Balance | Price | Value | Current % |';
    if (targetAllocations && targetAllocations.length > 0) {
      output += ' Target % | Deviation |';
    }
    output += '\n';
    
    // Separator
    output += '|-------|---------|-------|-------|-----------|';
    if (targetAllocations && targetAllocations.length > 0) {
      output += '---------|-----------|';
    }
    output += '\n';
    
    // Token rows
    for (const token of tokenData) {
      output += `| ${token.symbol} | ${token.balance.toFixed(4)} | $${token.price.toFixed(4)} | $${token.value.toFixed(2)} | ${token.allocation.toFixed(2)}% |`;
      
      // Add target allocation and deviation if they exist
      if (targetAllocations && targetAllocations.length > 0) {
        if (token.targetAllocation !== undefined) {
          output += ` ${token.targetAllocation.toFixed(2)}% |`;
          
          // Format deviation with color and sign
          if (token.deviation !== undefined) {
            const deviationStr = token.deviation > 0 
              ? `+${token.deviation.toFixed(2)}%` 
              : `${token.deviation.toFixed(2)}%`;
            
            output += ` ${deviationStr} |`;
          } else {
            output += ' N/A |';
          }
        } else {
          output += ' N/A | N/A |';
        }
      }
      
      output += '\n';
    }
    
    // Total row
    output += `| TOTAL | | | $${totalValue.toFixed(2)} | 100% |`;
    if (targetAllocations && targetAllocations.length > 0) {
      output += ' 100% | |';
    }
    output += '\n\n';
    
    // Add summary of current allocation
    output += '💼 CURRENT ALLOCATION SUMMARY:\n';
    for (const token of tokenData) {
      output += `- ${token.symbol}: ${token.allocation.toFixed(2)}% of portfolio (${token.balance.toFixed(4)} tokens @ $${token.price.toFixed(4)} = $${token.value.toFixed(2)})\n`;
    }
    output += '\n';
    
    // Add target allocation summary if it exists
    if (targetAllocations && targetAllocations.length > 0) {
      output += '🎯 TARGET ALLOCATION STRATEGY:\n';
      const sortedTargets = [...targetAllocations].sort((a, b) => b.percentage - a.percentage);
      for (const target of sortedTargets) {
        output += `- ${target.symbol}: ${target.percentage.toFixed(2)}%\n`;
      }
      output += '\n';
    }
    
    // Add recommendation if there are significant deviations
    if (targetAllocations && targetAllocations.length > 0) {
      const significantDeviations = tokenData
        .filter(t => t.deviation !== undefined && Math.abs(t.deviation) > 5)
        .sort((a, b) => Math.abs(b.deviation!) - Math.abs(a.deviation!));
      
      if (significantDeviations.length > 0) {
        output += '📝 REBALANCING RECOMMENDATIONS:\n';
        
        for (const token of significantDeviations) {
          if (token.deviation! > 5) {
            output += `- REDUCE ${token.symbol}: Currently ${token.allocation.toFixed(2)}%, target ${token.targetAllocation!.toFixed(2)}% (${token.deviation!.toFixed(2)}% overweight)\n`;
          } else if (token.deviation! < -5) {
            output += `- INCREASE ${token.symbol}: Currently ${token.allocation.toFixed(2)}%, target ${token.targetAllocation!.toFixed(2)}% (${Math.abs(token.deviation!).toFixed(2)}% underweight)\n`;
          }
        }
      }
    }
    
    return output;
    
  } catch (error) {
    console.error('❌ Error printing portfolio:', error);
    return '❌ Error printing portfolio. Please try again.';
  }
};
