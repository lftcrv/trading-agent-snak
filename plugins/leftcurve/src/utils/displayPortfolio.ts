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

    console.log('| Token | Balance | Entry Price | Current Price | Value (USD) | PnL | PnL % |');
    console.log('|-------|---------|-------------|---------------|-------------|-----|-------|');

    for (const token of result.query.rows) {
      const symbol = token.token_symbol;
      const balance = Number(token.balance);
      const entryPrice = token.entry_price ? Number(token.entry_price) : null;
      
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
      
      const value = balance * currentPrice;
      totalValue += value;
      
      let pnl = 'N/A';
      let pnlPct = 'N/A';
      
      if (entryPrice !== null && symbol !== 'USDC') {
        const unrealizedPnL = balance * (currentPrice - entryPrice);
        const pnlPercentage = ((currentPrice / entryPrice) - 1) * 100;
        pnl = `$${unrealizedPnL.toFixed(2)}`;
        pnlPct = `${pnlPercentage.toFixed(2)}%`;
      }
      
      console.log(`| ${symbol.padEnd(5)} | ${balance.toFixed(6).padEnd(7)} | $${entryPrice ? entryPrice.toFixed(4) : 'N/A'.padEnd(4)} | $${currentPrice.toFixed(4).padEnd(4)} | $${value.toFixed(2).padEnd(11)} | ${pnl.padEnd(3)} | ${pnlPct.padEnd(5)} |`);
    }
    
    console.log('---------------------');
    console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
    console.log('---------------------');
  } catch (error) {
    console.error('Error displaying portfolio:', error);
  }
}; 