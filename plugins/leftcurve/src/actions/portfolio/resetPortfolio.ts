import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';

export interface ResetPortfolioParams {
  keep_usdc?: boolean; // Optionally keep USDC balance
  usdc_amount?: number; // Set a specific USDC amount if keep_usdc is true
}

/**
 * Resets the portfolio by removing all tokens and optionally keeping USDC
 */
export const resetPortfolio = async (
  agent: StarknetAgentInterface,
  params: ResetPortfolioParams
) => {
  try {
    console.log('🔄 Starting resetPortfolio');
    const containerId = getContainerId();

    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    if (!db) throw new Error(`leftcurve_db_${containerId} not found`);

    let usdcBalance = 1000; // Default USDC balance
    
    // If keeping USDC, get the current balance first
    if (params.keep_usdc) {
      try {
        const usdcResult = await db.select({
          FROM: ['sak_table_portfolio'],
          SELECT: ['balance'],
          WHERE: [`token_symbol = 'USDC'`],
        });
        
        if (usdcResult.status === 'success' && usdcResult.query && usdcResult.query.rows.length > 0) {
          usdcBalance = Number(usdcResult.query.rows[0].balance);
          console.log(`📝 Current USDC balance: ${usdcBalance}`);
        }
      } catch (error) {
        console.warn('Could not retrieve USDC balance, using default value:', error);
      }
    }
    
    // If a specific USDC amount is provided, use that instead
    if (params.usdc_amount !== undefined) {
      usdcBalance = params.usdc_amount;
      console.log(`📝 Using provided USDC amount: ${usdcBalance}`);
    }

    // Delete all records from the portfolio table
    const deleteResult = await db.query('DELETE FROM sak_table_portfolio');
    
    if (deleteResult.status !== 'success') {
      throw new Error(`Failed to delete portfolio records: ${JSON.stringify(deleteResult)}`);
    }
    
    console.log('✅ All portfolio tokens deleted');
    
    // Insert USDC with the specified balance
    const insertResult = await db.query(`
      INSERT INTO sak_table_portfolio (token_symbol, balance, entry_price, entry_timestamp, unrealized_pnl, pnl_percentage)
      VALUES ('USDC', ${usdcBalance}, 1.0, CURRENT_TIMESTAMP, 0, 0)
    `);
    
    if (insertResult.status !== 'success') {
      throw new Error(`Failed to insert USDC: ${JSON.stringify(insertResult)}`);
    }
    
    console.log(`✅ Portfolio reset with ${usdcBalance} USDC`);
    
    return {
      success: true,
      message: `Portfolio reset successfully with ${usdcBalance} USDC`,
    };
  } catch (error) {
    console.error('❌ Error in resetPortfolio:', error);
    return {
      success: false,
      message: `Failed to reset portfolio: ${error.message || error}`,
    };
  }
}; 