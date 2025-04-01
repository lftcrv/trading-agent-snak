import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { BBOService } from '../paradexActions/getBBO.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/src/utils/utils.js';

/**
 * Input parameters to trade from one token to another
 */
export interface SimulateTradeParams {
  fromToken: string; // e.g. "ETH"
  toToken: string; // e.g. "MKR"
  fromAmount: number; // how much of 'fromToken' to trade
}

/**
 * Convert fromToken -> USDC -> toToken using best bid/ask
 *
 * 1. Sell 'fromToken' to get USDC, using BBO's best BID for fromToken-USD-PERP
 * 2. Buy 'toToken' with that USDC, using BBO's best ASK for toToken-USD-PERP
 */
export const simulateTrade = async (
  agent: StarknetAgentInterface,
  params: SimulateTradeParams
) => {
  try {
    console.log('🚀 Starting simulateTrade with params:', params);

    const db = await agent.getDatabaseByName('leftcurve_db');
    if (!db) throw new Error('leftcurve_db not found');

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
    if (params.fromToken.toUpperCase() === 'USDC') {
      usdcAmount = params.fromAmount;
      const newBal = currentFromTokenBalance - params.fromAmount;

      const updateQuery = `UPDATE sak_table_portfolio SET balance = ${newBal.toFixed(8)} WHERE token_symbol = 'USDC'`;
      const updateResult = await db.query(updateQuery);
    } else {
      const fromMarket = `${params.fromToken}-USD-PERP`;

      const config = await getParadexConfig();
      const bboService = new BBOService();

      // fetch BBO => best bid if selling
      const bboData = await bboService.fetchMarketBBO(config, fromMarket);
      if (!bboData?.bid) {
        throw new Error(
          `No valid bid price found for ${fromMarket} to SELL ${params.fromToken}.`
        );
      }

      // Multiply fromAmount * bestBid => how many USDC we get
      const bestBid = parseFloat(bboData.bid);
      if (Number.isNaN(bestBid)) {
        throw new Error('Parsed bid price is NaN — cannot simulate SELL');
      }
      usdcAmount = params.fromAmount * bestBid;

      const newFromBal = currentFromTokenBalance - params.fromAmount;
      const updateFromQuery = `UPDATE sak_table_portfolio SET balance = ${newFromBal.toFixed(8)} WHERE token_symbol = '${params.fromToken}'`;
      await db.query(updateFromQuery);
    }

    if (params.toToken.toUpperCase() === 'USDC') {
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
      return { success: true, message: msg };
    }

    const toMarket = `${params.toToken}-USD-PERP`;
    const config = await getParadexConfig();
    const bboService = new BBOService();

    const bboDataTo = await bboService.fetchMarketBBO(config, toMarket);
    if (!bboDataTo?.ask) {
      throw new Error(
        `No valid ask price found for ${toMarket} to BUY ${params.toToken}.`
      );
    }

    const bestAsk = parseFloat(bboDataTo.ask);
    if (Number.isNaN(bestAsk)) {
      throw new Error('Parsed ask price is NaN — cannot simulate BUY');
    }

    // => how many tokens we can buy
    const tokensToBuy = usdcAmount / bestAsk;

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
      const updatedTokenBalance = currentTokenBalance + tokensToBuy;

      const updateTokenQuery = `UPDATE sak_table_portfolio SET balance = ${updatedTokenBalance.toFixed(8)} WHERE token_symbol = '${params.toToken}'`;
      await db.query(updateTokenQuery);
    } else {
      await db.insert({
        table_name: 'sak_table_portfolio',
        fields: new Map([
          ['token_symbol', params.toToken],
          ['balance', tokensToBuy.toFixed(8)],
        ]),
      });
    }

    const msg = `Traded ${params.fromAmount} ${params.fromToken} => got ${usdcAmount.toFixed(
      4
    )} USDC => bought ${tokensToBuy.toFixed(
      6
    )} ${params.toToken} @ ask ${bestAsk.toFixed(2)} USDC`;

    const debugRows = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance'],
    });
    return { success: true, message: msg };
  } catch (error) {
    console.error('❌ Error in simulateTrade:', error);
    return { success: false, message: String(error) };
  }
};
