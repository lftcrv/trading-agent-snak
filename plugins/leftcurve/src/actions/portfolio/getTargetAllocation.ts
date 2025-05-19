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
    console.log('🎯 ALLOCATION CHECK: Agent is retrieving target allocation strategy');
    
    // Get target allocations
    const targetAllocations = await getTokenAllocation(agent);
    
    if (!targetAllocations || targetAllocations.length === 0) {
      console.log('⚠️ ALLOCATION CHECK: No target allocation has been set yet');
      return '⚠️ No target allocation has been set yet. Use set_target_allocation to define your investment strategy.';
    }
    
    // Extract updated_at timestamp from the first allocation (they should all have the same timestamp)
    let lastUpdated = '';
    if (targetAllocations[0].updated_at) {
      const dateObj = new Date(targetAllocations[0].updated_at);
      lastUpdated = dateObj.toISOString().replace('T', ' ').substring(0, 19);
    }
    
    // Format the output
    let output = `🎯 Current Target Allocation (last updated: ${lastUpdated}):\n\n`;
    
    // Header
    output += '| Token | Target % |\n';
    output += '|-------|----------|\n';
    
    // Sort by percentage (descending)
    const sortedAllocations = [...targetAllocations].sort((a, b) => b.percentage - a.percentage);
    
    // Token rows
    console.log(`📊 TARGET ALLOCATION FOUND (last updated: ${lastUpdated}):`);
    for (const allocation of sortedAllocations) {
      console.log(`- ${allocation.symbol}: ${allocation.percentage.toFixed(2)}%`);
      output += `| ${allocation.symbol} | ${allocation.percentage.toFixed(2)}% |\n`;
    }
    
    output += '\n';
    
    console.log('✅ ALLOCATION CHECK: Target allocation strategy successfully retrieved');
    return output;
    
  } catch (error) {
    console.error('❌ Error getting target allocation:', error);
    return '❌ Error getting target allocation. Please try again.';
  }
}; 