import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { BBOService } from '../paradexActions/getBBO.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { addParadexTrade } from '../../utils/paradexTradeHistory.js';
import { checkUsdcBalance } from '../../utils/checkUsdcBalance.js';
import { PriceService } from '../../services/PriceService.js';
import { checkTokenExists } from '../../utils/checkTokenExists.js';
import { addTokenToPortfolio } from '../../utils/addTokenToPortfolio.js';
import { displayPortfolio } from '../../utils/displayPortfolio.js';
import { isPnLCheckRecent } from '../../utils/lastPnLCheck.js';
import { validateSupportedToken } from '../../utils/validateSupportedToken.js';

export interface SimulateTradeParams {
  fromToken: string; // e.g. "ETH"
  toToken: string; // e.g. "MKR"
  fromAmount: number; // how much of 'fromToken' to trade
  explanation?: string; // explanation of the trade decision
}

/**
 * Input parameters to trade from one token to another
 */
export const simulateTrade = async (
  agent: StarknetAgentInterface,
  params: SimulateTradeParams
) => {
  try {
    console.log('🚀 Starting simulateTrade with params:', params);
    
    // Check if a PnL check was performed recently
    if (!isPnLCheckRecent()) {
      console.warn('⚠️ WARNING: No recent PnL check detected before trading. It is highly recommended to check PnL before making trading decisions.');
      console.warn('⚠️ The agent should call get_portfolio_pnl before trading to make informed decisions.');
    }
    
    // Validate that both tokens are supported on Paradex
    if (params.fromToken.toUpperCase() !== 'USDC') {
      const fromTokenValidation = validateSupportedToken(params.fromToken);
      if (!fromTokenValidation.isSupported) {
        console.error(`❌ ${fromTokenValidation.message}`);
        return { 
          success: false, 
          message: fromTokenValidation.message
        };
      }
    }
    
    if (params.toToken.toUpperCase() !== 'USDC') {
      const toTokenValidation = validateSupportedToken(params.toToken);
      if (!toTokenValidation.isSupported) {
        console.error(`❌ ${toTokenValidation.message}`);
        return { 
          success: false, 
          message: toTokenValidation.message
        };
      }
    }
    
    const containerId = getContainerId();

    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    if (!db) throw new Error(`leftcurve_db_${containerId} not found`);

    // If we're buying directly with USDC, check balance first
    if (params.fromToken.toUpperCase() === 'USDC') {
      const balanceCheck = await checkUsdcBalance(agent, params.fromAmount, params.toToken);
      if (!balanceCheck.success) {
        console.warn(balanceCheck.message);
        return { success: false, message: balanceCheck.message };
      }
    }

    const fromTokenRow = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['id', 'token_symbol', 'balance'],
      WHERE: [`token_symbol = '${params.fromToken}'`],
    });

    if (
      fromTokenRow.status !== 'success' ||
      !fromTokenRow.query ||
      fromTokenRow.query.rows.length === 0
    ) {
      throw new Error(
        `No ${params.fromToken} found in portfolio. Did you add it or init?`
      );
    }

    const currentFromTokenBalance = Number(fromTokenRow.query.rows[0].balance);
    console.log(
      `💰 Current ${params.fromToken} balance: ${currentFromTokenBalance}`
    );
    if (currentFromTokenBalance < params.fromAmount) {
      throw new Error(
        `Not enough ${params.fromToken}. Current balance = ${currentFromTokenBalance}, requested = ${params.fromAmount}`
      );
    }

    // Fetch all required data and prices before modifying the portfolio
    let usdcAmount = 0;
    let fromTokenPrice = 0;
    const config = await getParadexConfig();
    const priceService = PriceService.getInstance();
    
    // Get source token price
    if (params.fromToken.toUpperCase() === 'USDC') {
      usdcAmount = params.fromAmount;
      fromTokenPrice = 1; // 1:1 for USDC
    } else {
      // Get price with improved price service - force refresh for trading
      const tokenPrice = await priceService.getTokenPrice(params.fromToken, config, true);
      
      if (tokenPrice === undefined || tokenPrice <= 0) {
        throw new Error(
          `Could not get a valid price for ${params.fromToken}. Trading is not possible without pricing data.`
        );
      }
      
      fromTokenPrice = tokenPrice;
      usdcAmount = params.fromAmount * fromTokenPrice;
      console.log(`Selling ${params.fromAmount} ${params.fromToken} at price $${fromTokenPrice} = $${usdcAmount.toFixed(2)} USDC`);
    }

    let toTokenAmount = 0;
    let finalPrice = 0;

    if (params.toToken.toUpperCase() === 'USDC') {
      toTokenAmount = usdcAmount;
      finalPrice = 1; // 1:1 for USDC
    } else {
      // For destination token, we need the ask price (selling price)
      // First get the price through our improved service
      const tokenPrice = await priceService.getTokenPrice(params.toToken, config, true);
      
      if (tokenPrice === undefined || tokenPrice <= 0) {
        throw new Error(
          `Could not get a valid price for ${params.toToken}. Trading is not possible without pricing data.`
        );
      }
      
      finalPrice = tokenPrice;
      // How many tokens can we buy with our USDC amount?
      toTokenAmount = usdcAmount / finalPrice;
      console.log(`Buying ${params.toToken} with ${usdcAmount.toFixed(2)} USDC at price $${finalPrice} = ${toTokenAmount.toFixed(6)} ${params.toToken}`);
    }

    // Now that we have all prices and amounts, start a transaction to modify the portfolio
    try {
      // Start transaction
      await db.query('BEGIN');
      
      // Remove source token from portfolio
      const newFromBal = currentFromTokenBalance - params.fromAmount;
      const updateFromQuery = `UPDATE sak_table_portfolio SET balance = ${newFromBal.toFixed(8)} WHERE token_symbol = '${params.fromToken}'`;
      await db.query(updateFromQuery);
      
      // Add destination token to portfolio
      let addTokenSuccess = false;
      if (params.toToken.toUpperCase() === 'USDC') {
        // Add USDC to portfolio
        const addTokenResult = await addTokenToPortfolio(agent, 'USDC', toTokenAmount, 1.0);
        if (!addTokenResult.success) {
          throw new Error(`Failed to add USDC to portfolio: ${addTokenResult.message}`);
        }
        addTokenSuccess = true;
      } else {
        // Add the destination token to the portfolio
        const addTokenResult = await addTokenToPortfolio(agent, params.toToken, toTokenAmount, finalPrice);
        if (!addTokenResult.success) {
          throw new Error(`Failed to add ${params.toToken} to portfolio: ${addTokenResult.message}`);
        }
        addTokenSuccess = true;
      }
      
      // Record the trade
      if (params.toToken.toUpperCase() === 'USDC') {
        // Save a trade record for selling to USDC
        await addParadexTrade(db, {
          market: `${params.fromToken}-USD-PERP`,
          side: 'SELL',
          size: params.fromAmount,
          price: fromTokenPrice,
          order_type: 'MARKET',
          status: 'FILLED',
          trade_id: `sim-${Date.now()}`,
          timestamp: new Date().toISOString()
        });
      } else {
        // Save a single trade record for the direct swap
        await addParadexTrade(db, {
          market: `${params.fromToken}/${params.toToken}-SWAP`,
          side: 'SWAP',
          size: params.fromAmount,
          price: fromTokenPrice / finalPrice, // Exchange rate between the two tokens
          order_type: 'MARKET',
          status: 'FILLED',
          trade_id: `sim-${Date.now()}`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Commit transaction if everything succeeded
      await db.query('COMMIT');
      
      // Trade successful, prepare response message
      let msg = '';
      if (params.toToken.toUpperCase() === 'USDC') {
        msg = `Sold ${params.fromAmount} ${params.fromToken} => got ${usdcAmount.toFixed(4)} USDC. (No need to buy since toToken=USDC)`;
      } else {
        msg = `Traded ${params.fromAmount} ${params.fromToken} => got ${usdcAmount.toFixed(4)} USDC => bought ${toTokenAmount.toFixed(6)} ${params.toToken} @ price ${finalPrice.toFixed(2)} USDC`;
      }
      
      // Send trading info with explanation
      const tradeObject = {
        tradeId: Date.now().toString(),
        tradeType: 'simulateTrade',
        trade: {
          fromToken: params.fromToken,
          toToken: params.toToken,
          fromAmount: params.fromAmount,
          toAmount: toTokenAmount,
          price: finalPrice,
          explanation: params.explanation || 'No explanation provided',
        },
      };

      const tradingInfoDto = {
        runtimeAgentId: getContainerId(),
        information: tradeObject,
      };

      await sendTradingInfo(tradingInfoDto);

      if (params.explanation) {
        console.log('explanation:', params.explanation);
      }

      // Display the complete portfolio after the trade
      await displayPortfolio(agent);

      return { success: true, message: msg };
    } catch (error) {
      // If any part of the transaction fails, roll back all changes
      console.error('❌ Error during trade transaction, rolling back:', error);
      await db.query('ROLLBACK');
      throw error; // Re-throw to be caught by the outer try/catch
    }
  } catch (error) {
    console.error('❌ Error in simulateTrade:', error);
    return { success: false, message: String(error) };
  }
};
