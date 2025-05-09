import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { sendPortfolioData } from '../../utils/sendPortfolioData.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { PriceService } from '../../services/PriceService.js';

/**
 * Sends the total portfolio balance with token details to the backend KPI endpoint
 * Calculates the total value in USD of all tokens in the portfolio
 */
export const sendPortfolioBalance = async (agent: StarknetAgentInterface) => {
  try {
    console.log('🚀 Starting sendPortfolioBalance with token tracking');
    const containerId = getContainerId();

    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
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

    // Convert everything to USD value using our improved price service
    const tokens = portfolioResult.query.rows;
    const { getParadexConfig } = await import(
      '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js'
    );

    let totalUsdValue = 0;
    const priceService = PriceService.getInstance();
    const config = await getParadexConfig();

    // Process each token and calculate its USD value
    const tokenDetails = [];
    let failedTokens = 0;
    
    // Analyser le portefeuille
    for (const token of tokens) {
      const symbol = token.token_symbol;
      const balance = Number(token.balance);
      
      // Obtenir le prix avec notre service amélioré
      const price = await priceService.getTokenPrice(symbol, config);
      
      if (price !== undefined && price > 0) {
        const tokenUsdValue = balance * price;
        totalUsdValue += tokenUsdValue;
        console.log(
          `Token ${symbol}: ${balance} * $${price} = $${tokenUsdValue.toFixed(2)}`
        );
      } else {
        console.error(
          `❌ Failed to get any valid price for ${symbol}, not including in USD total`
        );
        failedTokens++;
      }

      tokenDetails.push({
        symbol,
        balance,
        price: price ?? 0,
        hasValidPrice: price !== undefined && price > 0,
      });
    }

    // Avertissement si certains tokens n'ont pas pu être valorisés
    if (failedTokens > 0) {
      console.warn(`⚠️ ${failedTokens} token(s) could not be valued and were excluded from total USD calculation`);
    }

    // Format details for logging with additional information about price validity
    const tokenSummary = tokenDetails
      .map(
        (token) => {
          if (token.hasValidPrice) {
            return `${token.symbol}: ${token.balance.toFixed(4)} (= $${(token.balance * token.price).toFixed(2)} @ $${token.price.toFixed(2)})`;
          } else {
            return `${token.symbol}: ${token.balance.toFixed(4)} (⚠️ No valid price)`;
          }
        }
      )
      .join(', ');

    console.log(`Portfolio: ${tokenSummary}`);
    console.log(`Total USD Value: $${totalUsdValue.toFixed(2)}`);

    // Create DTO for enhanced backend - now includes token details and validity info
    const portfolioBalanceDto = {
      runtimeAgentId: getContainerId(),
      balanceInUSD: totalUsdValue,
      tokens: tokenDetails.map(({ symbol, balance, price, hasValidPrice }) => ({
        symbol,
        balance,
        price,
        hasValidPrice
      })),
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
