import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';

/**
 * Checks if there's enough USDC balance for a specified amount
 * 
 * @param agent - The Starknet agent
 * @param requiredAmount - The amount of USDC that will be used
 * @param tokenSymbolToBuy - The token that will be bought (for better error messages)
 * @returns An object with success status and optional error message
 */
export const checkUsdcBalance = async (
  agent: StarknetAgentInterface,
  requiredAmount: number,
  tokenSymbolToBuy?: string
): Promise<{ success: boolean; message?: string; availableBalance?: number }> => {
  try {
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      return { 
        success: false, 
        message: `Database leftcurve_db_${containerId} not found` 
      };
    }

    // Query USDC balance
    const usdcRow = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['id', 'token_symbol', 'balance'],
      WHERE: [`token_symbol = 'USDC'`],
    });

    // Check if USDC exists in portfolio
    if (
      usdcRow.status !== 'success' ||
      !usdcRow.query ||
      usdcRow.query.rows.length === 0
    ) {
      return {
        success: false,
        message: 'No USDC found in portfolio. You need to add USDC first.',
        availableBalance: 0
      };
    }

    // Get the current USDC balance
    const currentUsdcBalance = Number(usdcRow.query.rows[0].balance);
    
    // Check if there's enough balance
    if (currentUsdcBalance < requiredAmount) {
      const tokenInfo = tokenSymbolToBuy ? ` to buy ${tokenSymbolToBuy}` : '';
      return {
        success: false,
        message: `⚠️ Insufficient USDC balance! Required: ${requiredAmount.toFixed(2)} USDC${tokenInfo}, Available: ${currentUsdcBalance.toFixed(2)} USDC`,
        availableBalance: currentUsdcBalance
      };
    }

    // Success case
    return { 
      success: true,
      availableBalance: currentUsdcBalance
    };
  } catch (error) {
    return {
      success: false,
      message: `Error checking USDC balance: ${error.message || error}`
    };
  }
}; 