import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';

/**
 * Token allocation interface
 */
export interface TokenAllocation {
  symbol: string;
  percentage: number;
}

/**
 * Extended token allocation interface that includes the timestamp
 */
export interface TokenAllocationExtended extends TokenAllocation {
  updated_at?: string;
}

/**
 * Database row interfaces
 */
interface TableExistsRow {
  exists: boolean;
}

interface AllocationRow {
  token_symbol: string;
  target_percentage: string;
}

interface AllocationRowExtended extends AllocationRow {
  updated_at: string;
}

/**
 * Sets the token allocation for the agent
 * @param agent The Starknet agent
 * @param allocations Array of token allocations
 * @param reasoning Optional reasoning for the allocation update
 */
export const setTokenAllocation = async (
  agent: StarknetAgentInterface,
  allocations: TokenAllocation[],
  reasoning?: string
): Promise<void> => {
  try {
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Create the portfolio_allocation_targets table if it doesn't exist
    await db.createTable({
      table_name: 'portfolio_allocation_targets',
      if_not_exist: true,
      fields: new Map([
        ['id', 'SERIAL PRIMARY KEY'],
        ['token_symbol', 'VARCHAR(50) NOT NULL'],
        ['target_percentage', 'NUMERIC(8,4) NOT NULL'],
        ['created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
        ['updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
        ['notes', 'TEXT'] // For storing reasoning
      ]),
    });
    
    // Start a transaction
    await db.query('BEGIN');
    
    try {
      // Clear existing allocations
      await db.query('DELETE FROM portfolio_allocation_targets');
      
      // Insert new allocations
      for (const allocation of allocations) {
        const fields = new Map([
          ['token_symbol', allocation.symbol],
          ['target_percentage', allocation.percentage.toString()]
        ]);
        
        // Add reasoning as notes if provided
        if (reasoning) {
          fields.set('notes', reasoning);
        }
        
        await db.insert({
          table_name: 'portfolio_allocation_targets',
          fields
        });
      }
      
      // Store the reasoning in the allocation_strategy table if provided
      if (reasoning) {
        await db.insert({
          table_name: 'allocation_strategy',
          fields: new Map([
            ['explanation', reasoning]
          ]),
        });
      }
      
      // Commit transaction
      await db.query('COMMIT');
      
    } catch (error) {
      // Rollback on error
      await db.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error setting token allocation:', error);
    throw error;
  }
};

/**
 * Gets the token allocation for the agent
 * @param agent The Starknet agent
 * @returns Array of token allocations or undefined if not found
 */
export const getTokenAllocation = async (
  agent: StarknetAgentInterface
): Promise<TokenAllocationExtended[] | undefined> => {
  try {
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Check if the table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'portfolio_allocation_targets'
      );
    `);
    
    // Access the result data safely
    if (!tableExists.status || tableExists.status !== 'success' || !tableExists.query || 
        !tableExists.query.rows || !tableExists.query.rows[0] || !tableExists.query.rows[0].exists) {
      console.log('ℹ️ portfolio_allocation_targets table does not exist yet');
      return undefined;
    }
    
    // Query the allocations with timestamps
    const result = await db.query(`
      SELECT token_symbol, target_percentage, updated_at 
      FROM portfolio_allocation_targets 
      ORDER BY target_percentage DESC
    `);
    
    // Access the result data safely
    if (!result.status || result.status !== 'success' || !result.query || 
        !result.query.rows || result.query.rows.length === 0) {
      console.log('ℹ️ No token allocations found');
      return undefined;
    }
    
    // Map the results to the TokenAllocationExtended interface
    const allocations: TokenAllocationExtended[] = result.query.rows.map((row: AllocationRowExtended) => ({
      symbol: row.token_symbol,
      percentage: parseFloat(row.target_percentage),
      updated_at: row.updated_at
    }));
    
    return allocations;
    
  } catch (error) {
    console.error('❌ Error getting token allocation:', error);
    return undefined;
  }
}; 