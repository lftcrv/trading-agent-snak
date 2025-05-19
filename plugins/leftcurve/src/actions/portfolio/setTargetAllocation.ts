import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getTokenAllocation, setTokenAllocation } from '../../utils/tokenAllocation.js';

/**
 * Sets the target allocation for the portfolio
 * @param agent The Starknet agent
 * @param params The parameters for setting the target allocation
 * @returns A message indicating the result of the operation
 */
export const setTargetAllocation = async (
  agent: StarknetAgentInterface,
  params: {
    allocations: { symbol: string; percentage: number }[];
    reasoning?: string;
  }
): Promise<string> => {
  try {
    console.log('🎯 ALLOCATION STRATEGY: Agent is setting target portfolio allocation percentages');
    
    // Get current date and time
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().replace('T', ' ').substring(0, 19);
    
    console.log(`📅 Date: ${formattedDate}`);
    
    // Validate input allocations
    const { allocations, reasoning } = params;
    
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      console.log('❌ Error: Invalid allocations provided');
      return '❌ Error: Invalid allocations provided. Please provide an array of token allocations.';
    }
    
    // Validate total percentage is 100%
    const totalPercentage = allocations.reduce(
      (sum, allocation) => sum + allocation.percentage, 
      0
    );
    
    if (Math.abs(totalPercentage - 100) > 0.01) {
      console.log(`❌ Error: Total allocation percentage must equal 100%. Current total: ${totalPercentage.toFixed(2)}%`);
      return `❌ Error: Total allocation percentage must equal 100%. Current total: ${totalPercentage.toFixed(2)}%`;
    }
    
    // Format allocations for storage
    const formattedAllocations = allocations.map(allocation => ({
      symbol: allocation.symbol.toUpperCase(),
      percentage: allocation.percentage
    }));
    
    // Log the allocation being set
    console.log('📊 TARGET ALLOCATION:');
    formattedAllocations.forEach(allocation => {
      console.log(`- ${allocation.symbol}: ${allocation.percentage.toFixed(2)}%`);
    });
    
    // Store the allocations
    await setTokenAllocation(agent, formattedAllocations, reasoning);
    console.log('✅ Target allocation saved to portfolio_allocation_targets table');
    
    // Format a nice response
    let response = `✅ Target allocation ${reasoning ? 'updated' : 'set'} successfully on ${formattedDate}:\n`;
    
    // Add the allocations
    const allocationList = formattedAllocations
      .map(a => `${a.symbol}: ${a.percentage.toFixed(2)}%`)
      .join('\n');
    
    response += allocationList;
    
    // Add reasoning if provided
    if (reasoning) {
      response += `\n\n📝 Reasoning for update: ${reasoning}`;
      console.log(`📝 Allocation reasoning: ${reasoning}`);
    }
    
    console.log('✅ ALLOCATION STRATEGY: Successfully recorded target allocation strategy');
    return response;
    
  } catch (error) {
    console.error('❌ Error setting target allocation:', error);
    return '❌ Error setting target allocation. Please try again.';
  }
}; 