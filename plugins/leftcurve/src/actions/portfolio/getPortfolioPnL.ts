import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { PriceService } from '../../services/PriceService.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { recordPnLCheck } from '../../utils/lastPnLCheck.js';

export interface GetPortfolioPnLParams {
  // No parameters needed for this action
}

/**
 * Gets the current PnL (Profit and Loss) for all tokens in the portfolio
 * Calculates unrealized PnL based on current market prices
 */
export const getPortfolioPnL = async (
  agent: StarknetAgentInterface,
  params: GetPortfolioPnLParams
) => {
  try {
    console.log('🚀 Starting getPortfolioPnL');
    // Record that a PnL check was performed
    recordPnLCheck();
    
    const containerId = getContainerId();

    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    if (!db) throw new Error(`leftcurve_db_${containerId} not found`);

    // Get all tokens from the portfolio
    const portfolioResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance', 'entry_price', 'entry_timestamp', 'unrealized_pnl', 'pnl_percentage'],
    });

    if (
      portfolioResult.status !== 'success' ||
      !portfolioResult.query ||
      portfolioResult.query.rows.length === 0
    ) {
      return { 
        success: false, 
        message: 'No tokens found in portfolio',
        pnl: [] 
      };
    }

    const tokens = portfolioResult.query.rows;
    const priceService = PriceService.getInstance();
    const config = await getParadexConfig();
    
    console.log(`🔍 DEBUG: Found ${tokens.length} tokens in portfolio:`, tokens.map(t => `${t.token_symbol}: ${t.balance}`).join(', '));
    
    // Track total portfolio value and PnL
    let totalPortfolioValue = 0;
    let totalPnL = 0;
    
    // Process each token and update its PnL
    const tokenPnLs = [];
    
    for (const token of tokens) {
      const symbol = token.token_symbol;
      const balance = Number(token.balance);
      let entryPrice = token.entry_price ? Number(token.entry_price) : null;
      
      // Skip tokens with zero balance
      if (balance <= 0) continue;
      
      let currentPrice = 1; // Default for USDC
      let tokenValue = balance;
      let unrealizedPnL = 0;
      let pnlPercentage = 0;
      
      // For non-USDC tokens, get current price and calculate PnL
      if (symbol !== 'USDC') {
        try {
          const fetchedPrice = await priceService.getTokenPrice(symbol, config, true);
          
          if (fetchedPrice === undefined || fetchedPrice <= 0) {
            console.warn(`Could not get a valid price for ${symbol}, using last known price`);
            // If we can't get current price, use the stored unrealized PnL if available
            if (token.unrealized_pnl) {
              unrealizedPnL = Number(token.unrealized_pnl);
              pnlPercentage = Number(token.pnl_percentage || 0);
            }
          } else {
            currentPrice = fetchedPrice;
            tokenValue = balance * currentPrice;
            
            // Calculate PnL if we have an entry price
            if (entryPrice !== null) {
              unrealizedPnL = balance * (currentPrice - entryPrice);
              pnlPercentage = ((currentPrice / entryPrice) - 1) * 100;
              
              // Update the database with the latest PnL values
              await db.query(`
                UPDATE sak_table_portfolio 
                SET unrealized_pnl = ${unrealizedPnL.toFixed(8)}, 
                    pnl_percentage = ${pnlPercentage.toFixed(8)} 
                WHERE token_symbol = '${symbol}'
              `);
            }
          }
        } catch (error) {
          console.error(`Error getting price for ${symbol}:`, error);
          // Use stored values if available
          if (token.unrealized_pnl) {
            unrealizedPnL = Number(token.unrealized_pnl);
            pnlPercentage = Number(token.pnl_percentage || 0);
          }
        }
      }
      
      // Add to total portfolio value and PnL
      totalPortfolioValue += tokenValue;
      totalPnL += unrealizedPnL;
      
      // Add to results array
      tokenPnLs.push({
        token: symbol,
        balance,
        current_price: currentPrice,
        value_usd: tokenValue,
        entry_price: entryPrice,
        entry_timestamp: token.entry_timestamp,
        unrealized_pnl: unrealizedPnL,
        pnl_percentage: pnlPercentage
      });
    }
    
    // Sort tokens by value (highest first)
    tokenPnLs.sort((a, b) => b.value_usd - a.value_usd);
    
    // Calculate overall portfolio PnL percentage
    const portfolioInitialValue = totalPortfolioValue - totalPnL;
    const portfolioPnLPercentage = portfolioInitialValue > 0 
      ? (totalPnL / portfolioInitialValue) * 100 
      : 0;
    
    // Format the response
    const result = {
      total_portfolio_value: totalPortfolioValue,
      total_pnl: totalPnL,
      portfolio_pnl_percentage: portfolioPnLPercentage,
      tokens: tokenPnLs
    };
    
    console.log('📊 Portfolio PnL calculated successfully');
    console.log(`💰 Total portfolio value: $${totalPortfolioValue.toFixed(2)}`);
    console.log(`💸 Total PnL: $${totalPnL.toFixed(2)} (${portfolioPnLPercentage.toFixed(2)}%)`);
    
    // Check if we have only USDC
    if (tokenPnLs.length === 1 && tokenPnLs[0].token === 'USDC') {
      console.log('⚠️ Portfolio contains only USDC. No PnL to calculate.');
    } else {
      console.log('📈 Token PnLs:');
      tokenPnLs.forEach(token => {
        if (token.token !== 'USDC' && token.entry_price) {
          console.log(`  ${token.token}: $${token.unrealized_pnl.toFixed(2)} (${token.pnl_percentage.toFixed(2)}%) | Entry: $${token.entry_price.toFixed(2)} | Current: $${token.current_price.toFixed(2)}`);
        }
      });
    }
    
    // Format a human-readable message
    let message = 'Portfolio PnL calculated successfully';
    if (tokenPnLs.length === 1 && tokenPnLs[0].token === 'USDC') {
      message = 'Portfolio contains only USDC with no PnL to calculate';
    } else {
      const nonUsdcTokens = tokenPnLs.filter(t => t.token !== 'USDC');
      if (nonUsdcTokens.length > 0) {
        const tokenSummaries = nonUsdcTokens.map(t => 
          `${t.token}: ${t.pnl_percentage.toFixed(2)}% (${t.unrealized_pnl > 0 ? '+' : ''}$${t.unrealized_pnl.toFixed(2)})`
        );
        message = `Portfolio value: $${totalPortfolioValue.toFixed(2)} | Total PnL: ${totalPnL > 0 ? '+' : ''}$${totalPnL.toFixed(2)} (${portfolioPnLPercentage.toFixed(2)}%) | ${tokenSummaries.join(' | ')}`;
      }
    }
    
    return { 
      success: true, 
      message,
      pnl: result
    };
  } catch (error) {
    console.error('❌ Error in getPortfolioPnL:', error);
    return { 
      success: false, 
      message: `Error calculating PnL: ${error.message || error}`,
      pnl: []
    };
  }
}; 