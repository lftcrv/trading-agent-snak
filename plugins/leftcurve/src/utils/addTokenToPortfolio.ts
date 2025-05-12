import { StarknetAgentInterface, PostgresAdaptater } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';
import { checkTokenExists } from './checkTokenExists.js';

/**
 * Adds a token to the portfolio or updates its balance if it already exists
 * 
 * @param agent - The Starknet agent
 * @param tokenSymbol - The token symbol to add
 * @param balance - The token balance to set
 * @param entryPrice - The entry price of the token
 * @returns An object with success status and details
 */
export const addTokenToPortfolio = async (
  agent: StarknetAgentInterface,
  tokenSymbol: string,
  balance: number,
  entryPrice: number
): Promise<{ success: boolean; message: string }> => {
  try {
    console.log(`🔍 DEBUG: Adding token ${tokenSymbol} to portfolio with balance ${balance.toFixed(8)} and entry price ${entryPrice.toFixed(8)}`);
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      const errorMsg = `Database leftcurve_db_${containerId} not found`;
      console.error(errorMsg);
      return { success: false, message: errorMsg };
    }

    // Check if token already exists
    const tokenCheck = await checkTokenExists(agent, tokenSymbol);
    
    let result;
    if (tokenCheck.exists) {
      // Token exists, update its balance and calculate weighted average entry price
      const currentBalance = tokenCheck.balance || 0;
      const currentEntryPrice = tokenCheck.entry_price || entryPrice;
      const updatedBalance = currentBalance + balance;
      
      // Calculate weighted average entry price
      let newEntryPrice;
      if (currentBalance <= 0) {
        newEntryPrice = entryPrice;
      } else {
        newEntryPrice = (currentBalance * currentEntryPrice + balance * entryPrice) / updatedBalance;
      }
      
      console.log(`🔄 Updating existing token ${tokenSymbol}: Balance ${currentBalance.toFixed(8)} -> ${updatedBalance.toFixed(8)}, Entry price ${currentEntryPrice.toFixed(8)} -> ${newEntryPrice.toFixed(8)}`);
      
      // Update token with new balance and entry price
      result = await db.query(`
        UPDATE sak_table_portfolio 
        SET balance = ${updatedBalance.toFixed(8)},
            entry_price = ${newEntryPrice.toFixed(8)},
            entry_timestamp = CASE 
                                WHEN entry_timestamp IS NULL THEN CURRENT_TIMESTAMP 
                                ELSE entry_timestamp 
                              END
        WHERE token_symbol = '${tokenSymbol}'
      `);
    } else {
      // Token doesn't exist, insert it
      console.log(`➕ Inserting new token ${tokenSymbol} with balance ${balance.toFixed(8)} and entry price ${entryPrice.toFixed(8)}`);
      
      // Use direct query to ensure it works
      result = await db.query(`
        INSERT INTO sak_table_portfolio (token_symbol, balance, entry_price, entry_timestamp)
        VALUES ('${tokenSymbol}', ${balance.toFixed(8)}, ${entryPrice.toFixed(8)}, CURRENT_TIMESTAMP)
      `);
      
      // Alternative method using the insert function
      if (result.status !== 'success') {
        console.log('⚠️ Direct query failed, trying with insert function');
        result = await db.insert({
          table_name: 'sak_table_portfolio',
          fields: new Map([
            ['token_symbol', tokenSymbol],
            ['balance', balance.toFixed(8)],
            ['entry_price', entryPrice.toFixed(8)],
            ['entry_timestamp', 'CURRENT_TIMESTAMP'],
          ]),
        });
      }
    }
    
    if (result.status !== 'success') {
      const errorMsg = `Failed to ${tokenCheck.exists ? 'update' : 'insert'} token ${tokenSymbol}: ${JSON.stringify(result)}`;
      console.error(errorMsg);
      return { success: false, message: errorMsg };
    }
    
    // Verify that the token was actually added/updated
    const verifyCheck = await checkTokenExists(agent, tokenSymbol);
    if (!verifyCheck.exists) {
      const errorMsg = `Failed to verify token ${tokenSymbol} in portfolio after ${tokenCheck.exists ? 'update' : 'insert'}`;
      console.error(errorMsg);
      return { success: false, message: errorMsg };
    }
    
    console.log(`✅ Successfully ${tokenCheck.exists ? 'updated' : 'added'} token ${tokenSymbol} to portfolio. New balance: ${verifyCheck.balance}`);
    return { 
      success: true, 
      message: `Successfully ${tokenCheck.exists ? 'updated' : 'added'} token ${tokenSymbol} to portfolio`
    };
  } catch (error) {
    const errorMsg = `Error adding token ${tokenSymbol} to portfolio: ${error.message || error}`;
    console.error(errorMsg);
    return { success: false, message: errorMsg };
  }
}; 