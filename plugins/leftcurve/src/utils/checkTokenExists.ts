import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';

/**
 * Checks if a token exists in the portfolio
 * 
 * @param agent - The Starknet agent
 * @param tokenSymbol - The token symbol to check
 * @returns An object with success status and token details if found
 */
export const checkTokenExists = async (
  agent: StarknetAgentInterface,
  tokenSymbol: string
): Promise<{ exists: boolean; balance?: number; entry_price?: number }> => {
  try {
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      console.error(`Database leftcurve_db_${containerId} not found`);
      return { exists: false };
    }

    // Query for the token
    const result = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance', 'entry_price'],
      WHERE: [`token_symbol = '${tokenSymbol}'`],
    });

    // Check if token exists
    if (
      result.status !== 'success' ||
      !result.query ||
      result.query.rows.length === 0
    ) {
      return { exists: false };
    }

    // Get the token data
    const token = result.query.rows[0];
    return {
      exists: true,
      balance: Number(token.balance),
      entry_price: token.entry_price ? Number(token.entry_price) : undefined
    };
  } catch (error) {
    console.error(`Error checking if token ${tokenSymbol} exists:`, error);
    return { exists: false };
  }
}; 