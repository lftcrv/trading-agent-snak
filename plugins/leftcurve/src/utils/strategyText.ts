import { PostgresAdaptater } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';

export interface StrategyText {
  strategy_text: string;
  timestamp?: Date | string;
}

/**
 * Save a new strategy text to the agent_strategies table
 */
export const saveStrategyText = async (
  database: PostgresAdaptater,
  strategyText: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const fields = new Map([['strategy_text', strategyText]]);

    const insertResult = await database.insert({
      table_name: 'agent_strategies',
      fields,
    });

    if (insertResult.status === 'success') {
      console.log('✅ Strategy text saved to agent_strategies table');
      
      // Keep only the most recent strategy
      await pruneStrategyHistory(database);
      
      return { success: true, message: 'Strategy saved successfully' };
    } else {
      console.error('❌ Failed to save strategy text:', insertResult);
      return { success: false, message: `Failed to save strategy text: ${insertResult.status}` };
    }
  } catch (error) {
    console.error('❌ Error saving strategy text to database:', error);
    return { 
      success: false, 
      message: `Error saving strategy text to database: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
};

/**
 * Keep only the most recent strategy in the database
 */
const pruneStrategyHistory = async (
  database: PostgresAdaptater
): Promise<void> => {
  try {
    // Delete all records except the latest one
    const pruneQuery = `
      DELETE FROM agent_strategies
      WHERE id NOT IN (
        SELECT id FROM agent_strategies
        ORDER BY timestamp DESC
        LIMIT 1
      )
    `;
    
    await database.query(pruneQuery);
    console.log('✅ Pruned strategy history to keep only the latest record');
  } catch (error) {
    console.error('❌ Error pruning strategy history:', error);
  }
};

/**
 * Get the most recent strategy text from the agent_strategies table
 */
export const getLatestStrategyText = async (
  database: PostgresAdaptater
): Promise<StrategyText | null> => {
  try {
    // Use query instead of select to use ORDER BY
    const strategyQuery = `
      SELECT * FROM agent_strategies 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    
    const strategyResult = await database.query(strategyQuery);
    
    if (
      strategyResult.status === 'success' &&
      strategyResult.query &&
      strategyResult.query.rows.length > 0
    ) {
      const row = strategyResult.query.rows[0];
      return {
        strategy_text: row.strategy_text,
        timestamp: row.timestamp,
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting latest strategy text:', error);
    return null;
  }
};

/**
 * Helper function to get time ago in human readable format
 */
export const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}; 