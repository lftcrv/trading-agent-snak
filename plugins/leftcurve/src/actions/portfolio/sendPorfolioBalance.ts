import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { sendPortfolioData } from '../../utils/sendPortfolioData.js';
import { getContainerId } from '../../utils/getContainerId.js';

/**
 * Sends the total portfolio balance to the backend
 * Calculates the total value in USD of all tokens in the portfolio
 */
export const sendPortfolioBalance = async (agent: StarknetAgentInterface) => {
  try {
    console.log('🚀 Starting sendPortfolioBalance');

    const db = await agent.getDatabaseByName('leftcurve_db');
    if (!db) {
      throw new Error('leftcurve_db not found');
    }

    // Get all tokens from the portfolio
    const portfolioResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance'],
    });

    if (
      portfolioResult.status !== 'success' ||
      !portfolioResult.query ||
      portfolioResult.query.rows.length === 0
    ) {
      throw new Error('No tokens found in portfolio');
    }

    // Convert everything to USD value using BBO data
    const tokens = portfolioResult.query.rows;
    const { getParadexConfig } = await import(
      '@starknet-agent-kit/plugin-paradex/src/utils/utils.js'
    );
    const { BBOService } = await import('../paradexActions/getBBO.js');

    let totalUsdValue = 0;
    const bboService = new BBOService();
    const config = await getParadexConfig();

    // Process each token
    for (const token of tokens) {
      const symbol = token.token_symbol;
      const balance = Number(token.balance);

      if (symbol === 'USDC') {
        // USDC is already in USD
        totalUsdValue += balance;
      } else {
        try {
          // Get the latest price from Paradex
          const market = `${symbol}-USD-PERP`;
          const bboData = await bboService.fetchMarketBBO(config, market);

          if (bboData?.bid) {
            // Use the bid price (what you could sell for)
            const bidPrice = parseFloat(bboData.bid);
            const tokenUsdValue = balance * bidPrice;
            totalUsdValue += tokenUsdValue;
            console.log(
              `Token ${symbol}: ${balance} * ${bidPrice} = ${tokenUsdValue.toFixed(2)}`
            );
          } else {
            console.warn(
              `Could not get price for ${symbol}, not including in USD total`
            );
          }
        } catch (error) {
          console.warn(`Error getting price for ${symbol}:`, error);
        }
      }
    }

    // Create a portfolio summary with all tokens including USD values
    const portfolioSummary = await Promise.all(
      tokens.map(async (token) => {
        const symbol = token.token_symbol;
        const balance = Number(token.balance);

        let usdValue = balance;
        let price = 1;

        if (symbol !== 'USDC') {
          try {
            // Get market price for non-USDC tokens
            const market = `${symbol}-USD-PERP`;
            const bboData = await bboService.fetchMarketBBO(config, market);

            if (bboData?.bid) {
              price = parseFloat(bboData.bid);
              usdValue = balance * price;
            }
          } catch (error) {
            console.warn(`Error getting USD value for ${symbol}`);
          }
        }

        return {
          symbol: symbol,
          balance: balance,
          usdValue: usdValue,
          price: price,
        };
      })
    );

    // Create the DTO for sending to backend
    const portfolioBalanceDto = {
      runtimeAgentId: getContainerId(),
      balanceInUSD: totalUsdValue,
      metadata: {
        timestamp: new Date().toISOString(),
        portfolio: portfolioSummary,
      },
    };

    console.log('Sending portfolio balance to backend:', portfolioBalanceDto);

    // Send to backend
    await sendPortfolioData(portfolioBalanceDto);

    return {
      success: true,
      data: portfolioBalanceDto,
      text: `Successfully sent portfolio balance to backend. Total USD value: ${totalUsdValue.toFixed(2)}`,
    };
  } catch (error) {
    console.error('❌ Error in sendPortfolioBalance:', error);
    return {
      success: false,
      data: null,
      text: `Failed to send portfolio balance: ${error.message}`,
    };
  }
};
