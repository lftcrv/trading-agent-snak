import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';
import { PriceService } from '../services/PriceService.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { formatAgentResponse } from './formatAgentResponse.js';

interface TokenValueData {
  symbol: string;
  balance: number;
  currentPrice: number;
  value: number;
  calculatedValue: number;
  entryPrice: number | null;
  allocation: number;
  pnl?: number;
  pnlPercentage?: number;
}

interface PortfolioSummary {
  totalValue: number;
  tokens: TokenValueData[];
  status: string;
  message?: string;
}

/**
 * Displays the complete portfolio with balances and values
 * 
 * @param agent - The Starknet agent
 * @returns Promise<void>
 */
export const displayPortfolio = async (
  agent: StarknetAgentInterface
): Promise<void> => {
  try {
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      const errorMsg = {
        status: 'error',
        message: `Database leftcurve_db_${containerId} not found`
      };
      console.log(formatAgentResponse(errorMsg, 'portfolio_display'));
      return;
    }

    // Get all tokens from the portfolio
    const result = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance', 'entry_price', 'unrealized_pnl', 'pnl_percentage'],
      WHERE: ['balance > 0'],
    });

    if (
      result.status !== 'success' ||
      !result.query ||
      result.query.rows.length === 0
    ) {
      const emptyMsg = {
        status: 'info',
        message: 'Portfolio is empty'
      };
      console.log(formatAgentResponse(emptyMsg, 'portfolio_display'));
      return;
    }

    // Get current prices for all tokens
    const priceService = PriceService.getInstance();
    const config = await getParadexConfig();
    let totalValue = 0;
    
    // First pass to calculate total value
    const tokenValues: TokenValueData[] = [];
    for (const token of result.query.rows) {
      const symbol = token.token_symbol;
      const balance = Number(token.balance);
      
      let currentPrice = 1; // Default for USDC
      if (symbol !== 'USDC') {
        try {
          const fetchedPrice = await priceService.getTokenPrice(symbol, config, false);
          if (fetchedPrice !== undefined && fetchedPrice > 0) {
            currentPrice = fetchedPrice;
          }
        } catch (error) {
          console.warn(`Could not get price for ${symbol}, using 1.0`);
        }
      }
      
      // Sanity check - validate prices for known tokens
      // Detect and correct unreasonable values
      if (symbol === 'BTC' && currentPrice > 1000) {
        // BTC is typically handled in fractions, not whole coins in most portfolios
        // Check if balance is unreasonably high which could suggest a unit error
        if (balance > 10) { // Having >10 BTC would be unusual for most portfolios
          console.warn(`⚠️ WARNING: Unusually high BTC balance detected (${balance}). This may be a unit error.`);
        }
      } else if (['ETH', 'WETH'].includes(symbol) && currentPrice > 500) {
        if (balance > 100) {
          console.warn(`⚠️ WARNING: Unusually high ${symbol} balance detected (${balance}). This may be a unit error.`);
        }
      }
      
      // Calculate value - cap at a reasonable maximum to prevent display issues
      const calculatedValue = balance * currentPrice;
      
      // Add a sanity check to detect unreasonable values
      const MAX_REASONABLE_VALUE = 10000000; // $10M as a reasonable cap for a trading portfolio
      let value = calculatedValue;
      
      if (calculatedValue > MAX_REASONABLE_VALUE) {
        console.warn(`⚠️ WARNING: Calculated value for ${symbol} (${calculatedValue.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}) exceeds reasonable limits. This may indicate incorrect price data or balance units.`);
      }
      
      totalValue += value;
      let entryPrice = token.entry_price ? Number(token.entry_price) : null;
      
      const tokenData: TokenValueData = {
        symbol,
        balance,
        currentPrice,
        value,
        calculatedValue,
        entryPrice,
        allocation: 0 // Will be calculated in second pass
      };
      
      tokenValues.push(tokenData);
    }

    // Second pass to calculate allocations and PnL
    for (const token of tokenValues) {
      // Calculate allocation percentage
      token.allocation = (token.value / totalValue) * 100;
      
      // Calculate PnL if entry price is available
      if (token.entryPrice !== null && token.symbol !== 'USDC') {
        token.pnl = token.balance * (token.currentPrice - token.entryPrice);
        token.pnlPercentage = ((token.currentPrice / token.entryPrice) - 1) * 100;
      }
    }
    
    // Sort tokens by value (descending)
    tokenValues.sort((a, b) => b.value - a.value);
    
    // Create portfolio summary object for JSON output
    const portfolioSummary: PortfolioSummary = {
      status: 'success',
      totalValue,
      tokens: tokenValues
    };
    
    // Log the JSON formatted portfolio data to console
    console.log(formatAgentResponse(portfolioSummary, 'portfolio_display'));
    
  } catch (error) {
    const errorData = {
      status: 'error',
      message: 'Error displaying portfolio',
      error: error.message
    };
    console.error(formatAgentResponse(errorData, 'portfolio_display'));
  }
}; 