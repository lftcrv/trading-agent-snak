import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/src/utils/utils.js';
import { MarketDetailsService } from '../paradexActions/fetchDetailedParadexMarkets.js';

/**
 * Input for simulateBuy
 */
export interface SimulateBuyParams {
  market: string; // e.g. "ETH-USDC"
  usdcAmount: number; // how much USDC the user wants to spend
}

/**
 * Simulate buying 'market' with usdcAmount from your portfolio
 */
export const simulateBuy = async (
  agent: StarknetAgentInterface,
  params: SimulateBuyParams
) => {
  try {
    console.log("fetching db")
    const db = await agent.getDatabaseByName('leftcurve_db');
    if (!db) {
      throw new Error('leftcurve_db not found');
    }
    console.log("fetched db successfully")
    const portfolioResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['id', 'token_symbol', 'balance'],
      WHERE: [`token_symbol = 'USDC'`],
    });

    if (
      portfolioResult.status !== 'success' ||
      !portfolioResult.query ||
      portfolioResult.query.rows.length === 0
    ) {
      throw new Error(
        'No USDC row found in portfolio. Did you run init_portfolio?'
      );
    }

    const currentUsdcBalance = Number(portfolioResult.query.rows[0].balance);
    console.log("usdc balance:", currentUsdcBalance)
    if (currentUsdcBalance < params.usdcAmount) {
      throw new Error(
        `Not enough USDC. Current balance = ${currentUsdcBalance}, requested = ${params.usdcAmount}`
      );
    }


    // 3. Fetch the price from Paradex
    // For example, you have a function that gets market details or price
    const config = await getParadexConfig();
    const service = new MarketDetailsService();
    const marketResponse = await service.fetchMarketDetails(
      config,
      params.market
    );

    console.log("market response:", marketResponse)

    // Here you’d parse the response to get a current price for "ETH" in terms of USDC
    // (The actual field might differ based on the shape of your result.)
    if (!marketResponse.results || !marketResponse.results[0]) {
      throw new Error(
        `Market not found or no data returned for ${params.market}`
      );
    }

    // Suppose you have a field that says "some price" in the response
    // This is just a placeholder; you'll implement the real logic
    const priceInUSDC = 1800; // <--- e.g. get from market details or another endpoint

    // 4. Calculate how many tokens we can buy
    // If 1 ETH = 1800 USDC, spending 50 USDC means 50 / 1800 = ~0.0277 ETH
    const tokensToBuy = params.usdcAmount / priceInUSDC;

    // 5. Subtract from USDC balance
    const newUsdcBalance = currentUsdcBalance - params.usdcAmount;

    // 6. Insert/update the row for the new token (e.g. "ETH")
    const tokenSymbol = params.market.split('-')[0]; // "ETH" if market is "ETH-USDC"

    // Check if we have that token row
    const tokenResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['id', 'token_symbol', 'balance'],
      WHERE: [`token_symbol = '${tokenSymbol}'`],
    });

    if (
      tokenResult.status === 'success' &&
      tokenResult.query &&
      tokenResult.query.rows.length > 0
    ) {
      // Already have a row, so just add
      const currentTokenBalance = Number(tokenResult.query.rows[0].balance);
      const updatedTokenBalance = currentTokenBalance + tokensToBuy;

      // Update that row
      await db.update({
        table_name: 'sak_table_portfolio',
        ONLY: false,
        SET: [`balance = ${updatedTokenBalance.toFixed(8)}`],
        WHERE: [`token_symbol = '${tokenSymbol}'`],
      });
    } else {
      // No row for that token yet -> insert
      await db.insert({
        table_name: 'sak_table_portfolio',
        fields: new Map([
          ['token_symbol', tokenSymbol],
          ['balance', tokensToBuy.toFixed(8)],
        ]),
      });
    }

    // 7. Update the USDC row
    await db.update({
      table_name: 'sak_table_portfolio',
      ONLY: false,
      SET: [`balance = ${newUsdcBalance.toFixed(8)}`],
      WHERE: [`token_symbol = 'USDC'`],
    });

    return {
      success: true,
      message: `Simulated buy of ${params.usdcAmount} USDC worth of ${tokenSymbol} @ price ${priceInUSDC}.`,
      newUsdcBalance,
      tokensBought: tokensToBuy,
    };
  } catch (error) {
    console.error('Error in simulateBuy:', error);
    return { success: false, message: `${error}` };
  }
};
