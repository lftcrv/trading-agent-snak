import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';

/**
 * Portfolio token interface
 */
export interface PortfolioToken {
  symbol: string;
  balance: number;
}

/**
 * Gets the tokens in the agent's portfolio
 * @param agent The Starknet agent
 * @returns Array of portfolio tokens or undefined if not found
 */
export const getPortfolioTokens = async (
  agent: StarknetAgentInterface
): Promise<PortfolioToken[] | undefined> => {
  try {
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Query the portfolio tokens
    const result = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance'],
      WHERE: ['balance > 0'],
    });
    
    if (result.status !== 'success' || !result.query || !result.query.rows || result.query.rows.length === 0) {
      console.log('ℹ️ No tokens found in portfolio');
      return undefined;
    }
    
    // Map the results to the PortfolioToken interface
    const tokens: PortfolioToken[] = result.query.rows.map(row => ({
      symbol: row.token_symbol,
      balance: parseFloat(row.balance)
    }));
    
    return tokens;
    
  } catch (error) {
    console.error('❌ Error getting portfolio tokens:', error);
    return undefined;
  }
}; 