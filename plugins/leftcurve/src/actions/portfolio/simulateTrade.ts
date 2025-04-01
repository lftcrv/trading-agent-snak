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

    // 1) Grab the DB
    const db = await agent.getDatabaseByName('leftcurve_db');
    console.log('🧠 DB instance details:', db);
    console.log('🔍 Fetched DB instance:', !!db ? 'OK' : 'NOT FOUND');
    if (!db) throw new Error('leftcurve_db not found');
    console.log('🔧 DB adapter type:', db.constructor.name);

    // 2) Verify user has enough 'fromToken'
    console.log(`🔎 Checking portfolio for token: ${params.fromToken}`);
    const fromTokenRow = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['id', 'token_symbol', 'balance'],
      WHERE: [`token_symbol = '${params.fromToken}'`],
    });
    console.log('🔎 fromTokenRow result:', fromTokenRow);

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

    // 3) If fromToken == 'USDC' => skip SELL step
    let usdcAmount = 0;
    if (params.fromToken.toUpperCase() === 'USDC') {
      console.log('🪙 fromToken is already USDC; skipping SELL step');
      // fromAmount is your "usdcAmount"
      usdcAmount = params.fromAmount;
      // Subtract from USDC row
      const newBal = currentFromTokenBalance - params.fromAmount;
      console.log(`📝 Updating USDC row => new USDC balance: ${newBal}`);

      const updateQuery = `UPDATE sak_table_portfolio SET balance = ${newBal.toFixed(8)} WHERE token_symbol = 'USDC'`;
      const updateResult = await db.query(updateQuery);
      console.log('🧪 Update result:', updateResult);
    } else {
      // 3a) Sell fromToken for USDC
      console.log(`🪙 Attempting SELL step: fromToken=${params.fromToken}`);
      const fromMarket = `${params.fromToken}-USD-PERP`;
      console.log('🌐 Creating BBOService, market:', fromMarket);

      const config = await getParadexConfig();
      const bboService = new BBOService();

      // fetch BBO => best bid if selling
      const bboData = await bboService.fetchMarketBBO(config, fromMarket);
      console.log('🔎 BBO data for SELL =>', bboData);
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
      console.log(
        `💵 Selling ${params.fromAmount} ${params.fromToken} => USDC gained: ${usdcAmount.toFixed(
          4
        )}`
      );

      // Subtract from fromToken row 
      const newFromBal = currentFromTokenBalance - params.fromAmount;
      console.log(
        `📝 Updating ${params.fromToken} row => new balance: ${newFromBal}`
      );

      const updateFromQuery = `UPDATE sak_table_portfolio SET balance = ${newFromBal.toFixed(8)} WHERE token_symbol = '${params.fromToken}'`;
      await db.query(updateFromQuery);
    }

    // 4) If toToken == 'USDC' => skip BUY step
    if (params.toToken.toUpperCase() === 'USDC') {
      console.log('🪙 toToken is USDC => skipping BUY step, just adding USDC');
      // Just add usdcAmount to USDC row
      const usdcRow = await db.select({
        FROM: ['sak_table_portfolio'],
        SELECT: ['id', 'token_symbol', 'balance'],
        WHERE: [`token_symbol = 'USDC'`],
      });
      console.log('🔎 Checking existing USDC row =>', usdcRow);

      if (
        usdcRow.status === 'success' &&
        usdcRow.query &&
        usdcRow.query.rows.length > 0
      ) {
        // update
        const currentUsdcBal = Number(usdcRow.query.rows[0].balance);
        const updatedUsdcBal = currentUsdcBal + usdcAmount;
        console.log(
          `📝 Updating USDC row => final USDC balance: ${updatedUsdcBal}`
        );

        const updateUsdcQuery = `UPDATE sak_table_portfolio SET balance = ${updatedUsdcBal.toFixed(8)} WHERE token_symbol = 'USDC'`;
        await db.query(updateUsdcQuery);
      } else {
        // insert
        console.log(
          '🆕 No existing USDC row, inserting new row with balance:',
          usdcAmount
        );
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
      console.log('✅ simulateTrade done =>', msg);
      return { success: true, message: msg };
    }

    // 5) Otherwise: Buy toToken with that USDC => check BBO ask
    console.log(
      `🪙 Attempting BUY step: toToken=${params.toToken}, USDC available=${usdcAmount.toFixed(
        4
      )}`
    );

    const toMarket = `${params.toToken}-USD-PERP`;
    const config = await getParadexConfig();
    const bboService = new BBOService();

    const bboDataTo = await bboService.fetchMarketBBO(config, toMarket);
    console.log('🔎 BBO data for BUY =>', bboDataTo);
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
    console.log(
      `💵 Buying ${params.toToken}: USDCspent=${usdcAmount.toFixed(
        4
      )}, bestAsk=${bestAsk.toFixed(4)}, tokensBought=${tokensToBuy.toFixed(6)}`
    );

    // Insert/update row for toToken
    const tokenResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['id', 'token_symbol', 'balance'],
      WHERE: [`token_symbol = '${params.toToken}'`],
    });
    console.log('🔎 Checking existing toToken row =>', tokenResult);

    if (
      tokenResult.status === 'success' &&
      tokenResult.query &&
      tokenResult.query.rows.length > 0
    ) {
      // Already have a row => sum up
      const currentTokenBalance = Number(tokenResult.query.rows[0].balance);
      const updatedTokenBalance = currentTokenBalance + tokensToBuy;
      console.log(
        `📝 Updating ${params.toToken} row => final balance: ${updatedTokenBalance.toFixed(
          6
        )}`
      );

      const updateTokenQuery = `UPDATE sak_table_portfolio SET balance = ${updatedTokenBalance.toFixed(8)} WHERE token_symbol = '${params.toToken}'`;
      await db.query(updateTokenQuery);
    } else {
      // Insert row for new token
      console.log(
        `🆕 No existing ${params.toToken} row, inserting new row => tokens=${tokensToBuy.toFixed(
          6
        )}`
      );
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
    console.log('✅ simulateTrade done =>', msg);

    const debugRows = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance'],
    });
    console.log(
      '🔥 Final DB snapshot in simulateTrade =>',
      debugRows.query?.rows
    );

    return { success: true, message: msg };
  } catch (error) {
    console.error('❌ Error in simulateTrade:', error);
    return { success: false, message: String(error) };
  }
};
