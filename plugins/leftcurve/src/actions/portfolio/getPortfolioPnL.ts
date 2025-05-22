import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { PriceService } from '../../services/PriceService.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { recordPnLCheck } from '../../utils/lastPnLCheck.js';
import { formatAgentResponse } from '../../utils/formatAgentResponse.js';

interface TokenPnL {
  token: string;
  balance: number;
  current_price: number;
  value_usd: number;
  entry_price: number | null;
  entry_timestamp: string | null;
  unrealized_pnl: number;
  pnl_percentage: number;
}

interface PortfolioPnLResult {
  total_portfolio_value: number;
  total_pnl: number;
  portfolio_pnl_percentage: number;
  tokens: TokenPnL[];
  status: string;
  message: string;
}

export interface GetPortfolioPnLParams {
  // No parameters needed for this action
}

/**
 * Gets the current PnL (Profit and Loss) for all tokens in the portfolio
 * Calculates unrealized PnL based on current market prices
 * @returns JSON formatted string with PnL data
 */
export const getPortfolioPnL = async (
  agent: StarknetAgentInterface,
  params: GetPortfolioPnLParams
): Promise<string> => {
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
      const errorResponse: PortfolioPnLResult = {
        status: 'error',
        message: 'No tokens found in portfolio',
        total_portfolio_value: 0,
        total_pnl: 0,
        portfolio_pnl_percentage: 0,
        tokens: []
      };
      console.log(formatAgentResponse(errorResponse, 'portfolio_pnl'));
      return formatAgentResponse(errorResponse, 'portfolio_pnl');
    }

    const tokens = portfolioResult.query.rows;
    const priceService = PriceService.getInstance();
    const config = await getParadexConfig();
    
    console.log(`🔍 DEBUG: Found ${tokens.length} tokens in portfolio:`, tokens.map(t => `${t.token_symbol}: ${t.balance}`).join(', '));
    
    // Track total portfolio value and PnL
    let totalPortfolioValue = 0;
    let totalPnL = 0;
    
    // Process each token and update its PnL
    const tokenPnLs: TokenPnL[] = [];
    
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
    const result: PortfolioPnLResult = {
      status: 'success',
      message: 'Portfolio PnL calculated successfully',
      total_portfolio_value: totalPortfolioValue,
      total_pnl: totalPnL,
      portfolio_pnl_percentage: portfolioPnLPercentage,
      tokens: tokenPnLs
    };
    
    // Generate message for result based on portfolio content
    if (tokenPnLs.length === 1 && tokenPnLs[0].token === 'USDC') {
      result.message = 'Portfolio contains only USDC with no PnL to calculate';
    } else {
      const nonUsdcTokens = tokenPnLs.filter(t => t.token !== 'USDC');
      if (nonUsdcTokens.length > 0) {
        const tokenSummaries = nonUsdcTokens.map(t => 
          `${t.token}: ${t.pnl_percentage.toFixed(2)}% (${t.unrealized_pnl > 0 ? '+' : ''}$${t.unrealized_pnl.toFixed(2)})`
        );
        result.message = `Portfolio value: $${totalPortfolioValue.toFixed(2)} | Total PnL: ${totalPnL > 0 ? '+' : ''}$${totalPnL.toFixed(2)} (${portfolioPnLPercentage.toFixed(2)}%) | ${tokenSummaries.join(' | ')}`;
      }
    }
    
    // Log the JSON response
    console.log(formatAgentResponse(result, 'portfolio_pnl'));
    
    // Return the JSON-formatted response
    return formatAgentResponse(result, 'portfolio_pnl');
    
  } catch (error) {
    const errorResponse: PortfolioPnLResult = {
      status: 'error',
      message: `Error calculating PnL: ${error.message || error}`,
      total_portfolio_value: 0,
      total_pnl: 0,
      portfolio_pnl_percentage: 0,
      tokens: []
    };
    
    console.error('❌ Error in getPortfolioPnL:', error);
    console.log(formatAgentResponse(errorResponse, 'portfolio_pnl'));
    
    return formatAgentResponse(errorResponse, 'portfolio_pnl');
  }
}; 