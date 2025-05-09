import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { BBOService } from '../paradexActions/getBBO.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { addParadexTrade } from '../../utils/paradexTradeHistory.js';
import { checkUsdcBalance } from '../../utils/checkUsdcBalance.js';
import { PriceService } from '../../services/PriceService.js';

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

    let usdcAmount = 0;
    let fromTokenPrice = 0;
    const config = await getParadexConfig();
    const priceService = PriceService.getInstance();
    
    if (params.fromToken.toUpperCase() === 'USDC') {
      usdcAmount = params.fromAmount;
      fromTokenPrice = 1; // 1:1 for USDC
      const newBal = currentFromTokenBalance - params.fromAmount;

      const updateQuery = `UPDATE sak_table_portfolio SET balance = ${newBal.toFixed(8)} WHERE token_symbol = 'USDC'`;
      const updateResult = await db.query(updateQuery);
    } else {
      // Obtenir le prix avec notre service amélioré - forcer le rafraîchissement pour le trading
      const tokenPrice = await priceService.getTokenPrice(params.fromToken, config, true);
      
      if (tokenPrice === undefined || tokenPrice <= 0) {
        throw new Error(
          `Could not get a valid price for ${params.fromToken}. Trading is not possible without pricing data.`
        );
      }
      
      fromTokenPrice = tokenPrice;
      usdcAmount = params.fromAmount * fromTokenPrice;
      console.log(`Selling ${params.fromAmount} ${params.fromToken} at price $${fromTokenPrice} = $${usdcAmount.toFixed(2)} USDC`);

      const newFromBal = currentFromTokenBalance - params.fromAmount;
      const updateFromQuery = `UPDATE sak_table_portfolio SET balance = ${newFromBal.toFixed(8)} WHERE token_symbol = '${params.fromToken}'`;
      await db.query(updateFromQuery);
    }

    let toTokenAmount = 0;
    let finalPrice = 0;

    if (params.toToken.toUpperCase() === 'USDC') {
      toTokenAmount = usdcAmount;
      finalPrice = 1; // 1:1 for USDC

      const usdcRow = await db.select({
        FROM: ['sak_table_portfolio'],
        SELECT: ['id', 'token_symbol', 'balance'],
        WHERE: [`token_symbol = 'USDC'`],
      });

      if (
        usdcRow.status === 'success' &&
        usdcRow.query &&
        usdcRow.query.rows.length > 0
      ) {
        // update
        const currentUsdcBal = Number(usdcRow.query.rows[0].balance);
        const updatedUsdcBal = currentUsdcBal + usdcAmount;
        const updateUsdcQuery = `UPDATE sak_table_portfolio SET balance = ${updatedUsdcBal.toFixed(8)} WHERE token_symbol = 'USDC'`;
        await db.query(updateUsdcQuery);
      } else {
        await db.insert({
          table_name: 'sak_table_portfolio',
          fields: new Map([
            ['token_symbol', 'USDC'],
            ['balance', usdcAmount.toFixed(8)],
          ]),
        });
      }

      const msg = `Sold ${params.fromAmount} ${params.fromToken} => got ${usdcAmount.toFixed(
        4
      )} USDC. (No need to buy since toToken=USDC)`;

      // Save a single trade record for the USDC trade
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

      return { success: true, message: msg };
    }

    // Pour l'achat du token de destination, nous avons besoin du prix ask (de vente)
    // Nous obtenons d'abord le prix via notre service amélioré
    const tokenPrice = await priceService.getTokenPrice(params.toToken, config, true);
    
    if (tokenPrice === undefined || tokenPrice <= 0) {
      throw new Error(
        `Could not get a valid price for ${params.toToken}. Trading is not possible without pricing data.`
      );
    }
    
    finalPrice = tokenPrice;
    // Combien de tokens pouvons-nous acheter avec notre montant USDC?
    toTokenAmount = usdcAmount / finalPrice;
    console.log(`Buying ${params.toToken} with ${usdcAmount.toFixed(2)} USDC at price $${finalPrice} = ${toTokenAmount.toFixed(6)} ${params.toToken}`);

    // Insert/update row for toToken
    const tokenResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['id', 'token_symbol', 'balance'],
      WHERE: [`token_symbol = '${params.toToken}'`],
    });

    if (
      tokenResult.status === 'success' &&
      tokenResult.query &&
      tokenResult.query.rows.length > 0
    ) {
      // Already have a row => sum up
      const currentTokenBalance = Number(tokenResult.query.rows[0].balance);
      const updatedTokenBalance = currentTokenBalance + toTokenAmount;

      const updateTokenQuery = `UPDATE sak_table_portfolio SET balance = ${updatedTokenBalance.toFixed(8)} WHERE token_symbol = '${params.toToken}'`;
      await db.query(updateTokenQuery);
    } else {
      await db.insert({
        table_name: 'sak_table_portfolio',
        fields: new Map([
          ['token_symbol', params.toToken],
          ['balance', toTokenAmount.toFixed(8)],
        ]),
      });
    }

    // Save a single trade record for the direct swap
    // Instead of recording two separate transactions, record one combined swap
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

    const msg = `Traded ${params.fromAmount} ${params.fromToken} => got ${usdcAmount.toFixed(
      4
    )} USDC => bought ${toTokenAmount.toFixed(
      6
    )} ${params.toToken} @ price ${finalPrice.toFixed(2)} USDC`;

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

    return { success: true, message: msg };
  } catch (error) {
    console.error('❌ Error in simulateTrade:', error);
    return { success: false, message: String(error) };
  }
};
