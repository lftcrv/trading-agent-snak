import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { sendPortfolioData } from '../../utils/sendPortfolioData.js';
import { getContainerId } from '../../utils/getContainerId.js';

/**
 * Sends the total portfolio balance with token details to the backend KPI endpoint
 * Calculates the total value in USD of all tokens in the portfolio
 */
export const sendPortfolioBalance = async (agent: StarknetAgentInterface) => {
  try {
    console.log('🚀 Starting sendPortfolioBalance with token tracking');

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
      '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js'
    );
    const { BBOService } = await import('../paradexActions/getBBO.js');

    let totalUsdValue = 0;
    const bboService = new BBOService();
    const config = await getParadexConfig();

    // Process each token and calculate its USD value
    const tokenDetails = [];
    for (const token of tokens) {
      const symbol = token.token_symbol;
      const balance = Number(token.balance);
      let price = 0;

      if (symbol === 'USDC') {
        // USDC is already in USD
        price = 1;
        totalUsdValue += balance;
      } else {
        try {
          // Get the latest price from Paradex
          const market = `${symbol}-USD-PERP`;
          const bboData = await bboService.fetchMarketBBO(config, market);

          if (bboData?.bid) {
            // Use the bid price (what you could sell for)
            price = parseFloat(bboData.bid);
            const tokenUsdValue = balance * price;
            totalUsdValue += tokenUsdValue;
            console.log(
              `Token ${symbol}: ${balance} * $${price} = $${tokenUsdValue.toFixed(2)}`
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

      tokenDetails.push({
        symbol,
        balance,
        price,
      });
    }

    // Format details for logging
    const tokenSummary = tokenDetails
      .map(
        (token) =>
          `${token.symbol}: ${token.balance.toFixed(4)} (= $${(token.balance * token.price).toFixed(2)} @ $${token.price.toFixed(2)})`
      )
      .join(', ');

    console.log(`Portfolio: ${tokenSummary}`);
    console.log(`Total USD Value: $${totalUsdValue.toFixed(2)}`);

    // Create DTO for enhanced backend - now includes token details
    const portfolioBalanceDto = {
      runtimeAgentId: getContainerId(),
      balanceInUSD: totalUsdValue,
      tokens: tokenDetails,
    };

    // Send to backend
    await sendPortfolioData(portfolioBalanceDto);

    return {
      success: true,
      data: {
        totalUsdValue,
        tokens: tokenDetails,
      },
      text: `Successfully sent portfolio balance of $${totalUsdValue.toFixed(2)} USD to backend with tokens: ${tokenSummary}`,
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
