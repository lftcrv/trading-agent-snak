import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getTokenAllocation } from '../../utils/tokenAllocation.js';

/**
 * Gets the target allocation for the portfolio
 * @param agent The Starknet agent
 * @returns A formatted string with the target allocation details
 */
export const getTargetAllocation = async (
  agent: StarknetAgentInterface
): Promise<string> => {
  try {
    // Get target allocations
    const targetAllocations = await getTokenAllocation(agent);
    
    if (!targetAllocations || targetAllocations.length === 0) {
      return '⚠️ No target allocation has been set yet. Use set_target_allocation to define your investment strategy.';
    }
    
    // Format the output
    let output = '🎯 Current Target Allocation:\n\n';
    
    // Header
    output += '| Token | Target % |\n';
    output += '|-------|----------|\n';
    
    // Sort by percentage (descending)
    const sortedAllocations = [...targetAllocations].sort((a, b) => b.percentage - a.percentage);
    
    // Token rows
    for (const allocation of sortedAllocations) {
      output += `| ${allocation.symbol} | ${allocation.percentage.toFixed(2)}% |\n`;
    }
    
    output += '\n';
    
    return output;
    
  } catch (error) {
    console.error('❌ Error getting target allocation:', error);
    return '❌ Error getting target allocation. Please try again.';
  }
}; 