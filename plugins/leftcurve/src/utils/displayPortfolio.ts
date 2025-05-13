import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';
import { PriceService } from '../services/PriceService.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';

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
    console.log('📊 PORTFOLIO SUMMARY:');
    console.log('---------------------');
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      console.error(`Database leftcurve_db_${containerId} not found`);
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
      console.log('Portfolio is empty');
      return;
    }

    // Get current prices for all tokens
    const priceService = PriceService.getInstance();
    const config = await getParadexConfig();
    let totalValue = 0;
    
    // First pass to calculate total value
    const tokenValues = [];
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
          // Optionally adjust calculations or warn the user
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
        // Optionally cap the value for display purposes
        // value = MAX_REASONABLE_VALUE;
      }
      
      totalValue += value;
      tokenValues.push({
        symbol,
        balance,
        currentPrice,
        value,
        calculatedValue, // Store original value for debugging
        entryPrice: token.entry_price ? Number(token.entry_price) : null
      });
    }

    console.log('| Token | Balance | Entry Price | Current Price | Value (USD) | Allocation % | PnL | PnL % |');
    console.log('|-------|---------|-------------|---------------|-------------|--------------|-----|-------|');

    // Second pass to display with allocations
    for (const token of tokenValues) {
      const { symbol, balance, currentPrice, value, entryPrice } = token;
      
      // Calculate allocation percentage - ensure proper formatting for very small values
      const allocation = (value / totalValue) * 100;
      const formattedAllocation = allocation < 0.01 ? '<0.01' : allocation.toFixed(2);
      
      let pnl = 'N/A';
      let pnlPct = 'N/A';
      
      if (entryPrice !== null && symbol !== 'USDC') {
        const unrealizedPnL = balance * (currentPrice - entryPrice);
        const pnlPercentage = ((currentPrice / entryPrice) - 1) * 100;
        
        // Sanity check for PnL percentage
        const formattedPnLPct = Math.abs(pnlPercentage) > 1000 ? 
          `${pnlPercentage > 0 ? '>' : '<'}1000%` : 
          `${pnlPercentage.toFixed(2)}%`;
        
        pnl = `$${unrealizedPnL.toFixed(2)}`;
        pnlPct = formattedPnLPct;
      }
      
      // Format value with appropriate commas for readability
      const formattedValue = value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      
      console.log(`| ${symbol.padEnd(5)} | ${balance.toFixed(6).padEnd(9)} | $${entryPrice ? entryPrice.toFixed(4) : 'N/A'.padEnd(4)} | $${currentPrice.toFixed(4).padEnd(6)} | $${formattedValue.padEnd(13)} | ${formattedAllocation}% | ${pnl.padEnd(15)} | ${pnlPct.padEnd(10)} |`);
    }
    
    // Format total value with appropriate commas
    const formattedTotal = totalValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    console.log('---------------------');
    console.log(`Total Portfolio Value: $${formattedTotal}`);
    console.log('---------------------');

    // Add allocation summary section
    console.log('\n📊 ALLOCATION BREAKDOWN:');
    for (const token of tokenValues) {
      const allocation = (token.value / totalValue) * 100;
      const formattedAllocation = allocation < 0.01 ? '<0.01' : allocation.toFixed(2);
      const formattedValue = token.value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      console.log(`- ${token.symbol}: ${formattedAllocation}% ($${formattedValue})`);
    }
    console.log('---------------------');
    
  } catch (error) {
    console.error('Error displaying portfolio:', error);
  }
}; 