import { PostgresAdaptater } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';

export interface AgentExplanation {
  explanation: string;
  timestamp?: Date | string;
  market?: string;
  reason?: string;
  price?: number;
  volume?: number;
  volatility?: number;
  trend?: string;
  decision_type?: string;
}

/**
 * Add a new explanation to the agent_explanations table
 */
export const addAgentExplanation = async (
  database: PostgresAdaptater,
  explanation: string,
  additionalData?: {
    market?: string;
    reason?: string;
    price?: number;
    volume?: number;
    volatility?: number;
    trend?: string;
    decision_type?: string;
  }
): Promise<{ success: boolean; message: string }> => {
  try {
    const fields = new Map([['explanation', explanation]]);

    // Add optional fields if they exist
    if (additionalData) {
      if (additionalData.market) fields.set('market', additionalData.market);
      if (additionalData.reason) fields.set('reason', additionalData.reason);
      if (additionalData.price) fields.set('price', additionalData.price.toString());
      if (additionalData.volume) fields.set('volume', additionalData.volume.toString());
      if (additionalData.volatility) fields.set('volatility', additionalData.volatility.toString());
      if (additionalData.trend) fields.set('trend', additionalData.trend);
      if (additionalData.decision_type) fields.set('decision_type', additionalData.decision_type);
    }

    const insertResult = await database.insert({
      table_name: 'agent_explanations',
      fields,
    });

    if (insertResult.status === 'success') {
      console.log('✅ Explanation added to agent_explanations table');
      
      // Keep only the latest 3 explanations
      await pruneExplanationsHistory(database);
      
      return { success: true, message: 'Explanation recorded successfully' };
    } else {
      console.error('❌ Failed to add explanation:', insertResult);
      return { success: false, message: `Failed to add explanation: ${insertResult.status}` };
    }
  } catch (error) {
    console.error('❌ Error adding explanation to database:', error);
    return { 
      success: false, 
      message: `Error adding explanation to database: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
};

/**
 * Keep only the latest 3 explanations in the database
 */
const pruneExplanationsHistory = async (
  database: PostgresAdaptater
): Promise<void> => {
  try {
    // Delete all records except the latest 3
    const pruneQuery = `
      DELETE FROM agent_explanations
      WHERE id NOT IN (
        SELECT id FROM agent_explanations
        ORDER BY timestamp DESC
        LIMIT 3
      )
    `;
    
    await database.query(pruneQuery);
    console.log('✅ Pruned explanation history to keep only the latest 3 records');
  } catch (error) {
    console.error('❌ Error pruning explanation history:', error);
  }
};

/**
 * Get the latest explanations from the agent_explanations table (up to 3)
 */
export const getLatestAgentExplanations = async (
  database: PostgresAdaptater
): Promise<AgentExplanation[]> => {
  try {
    // Use query instead of select to use ORDER BY
    const explanationsQuery = `
      SELECT * FROM agent_explanations 
      ORDER BY timestamp DESC 
      LIMIT 3
    `;
    
    const explanationsResult = await database.query(explanationsQuery);
    
    if (
      explanationsResult.status === 'success' &&
      explanationsResult.query &&
      explanationsResult.query.rows.length > 0
    ) {
      const mappedExplanations = explanationsResult.query.rows.map((row) => ({
        explanation: row.explanation,
        timestamp: row.timestamp,
      }));
      
      return mappedExplanations;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error getting latest explanations:', error);
    return [];
  }
};

/**
 * Helper function to get the database instance
 */
export const getExplanationsDatabase = async (): Promise<PostgresAdaptater | undefined> => {
  try {
    const containerId = getContainerId();
    // We're reusing the leftcurve database
    // @ts-ignore
    const agent = global.agent;
    return agent?.getDatabaseByName(`leftcurve_db_${containerId}`);
  } catch (error) {
    console.error('❌ Error getting database instance:', error);
    return undefined;
  }
};

/**
 * Debug function to check the structure of the agent_explanations table
 */
export const inspectAgentExplanationsTable = async (
  database: PostgresAdaptater
): Promise<any> => {
  try {
    console.log('🔎 Inspecting agent_explanations table structure...');
    
    // Get column info
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'agent_explanations'
      ORDER BY ordinal_position;
    `;
    
    const columnsResult = await database.query(columnsQuery);
    
    // Count total records
    const countQuery = `SELECT COUNT(*) as count FROM agent_explanations;`;
    const countResult = await database.query(countQuery);
    
    let count = 0;
    if (countResult.status === 'success' && countResult.query) {
      count = parseInt(countResult.query.rows[0].count);
    }
    
    // Get a sample record (latest one)
    const sampleQuery = `SELECT * FROM agent_explanations ORDER BY id DESC LIMIT 1;`;
    const sampleResult = await database.query(sampleQuery);
    
    return {
      success: true,
      columns: columnsResult.status === 'success' ? columnsResult.query?.rows : [],
      count: count,
      sampleRecord: (sampleResult.status === 'success' && sampleResult.query && sampleResult.query.rows.length > 0) 
        ? sampleResult.query.rows[0] 
        : null
    };
  } catch (error) {
    console.error('❌ Error inspecting agent_explanations table:', error);
    return { success: false, error: String(error) };
  }
}; 