import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { PriceService } from '../../services/PriceService.js';
import { getParadexConfig } from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';

export interface InitializePortfolioPnLParams {
  // No parameters needed
}

/**
 * Initializes the entry prices for tokens in the portfolio that don't have them yet
 * This is useful when migrating from an older version without PnL tracking
 */
export const initializePortfolioPnL = async (
  agent: StarknetAgentInterface,
  params: InitializePortfolioPnLParams
) => {
  try {
    console.log('🚀 Starting initializePortfolioPnL');
    const containerId = getContainerId();

    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    if (!db) throw new Error(`leftcurve_db_${containerId} not found`);

    // Get all tokens from the portfolio that don't have entry prices
    const portfolioResult = await db.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['token_symbol', 'balance', 'entry_price'],
      WHERE: ['entry_price IS NULL AND balance > 0'],
    });

    if (
      portfolioResult.status !== 'success' ||
      !portfolioResult.query ||
      portfolioResult.query.rows.length === 0
    ) {
      console.log('✅ No tokens need initialization - all tokens already have entry prices');
      return { 
        success: true, 
        message: 'No tokens need initialization',
        initialized: []
      };
    }

    const tokens = portfolioResult.query.rows;
    console.log(`🔄 Found ${tokens.length} tokens that need entry price initialization:`, 
      tokens.map(t => t.token_symbol).join(', '));
    
    const priceService = PriceService.getInstance();
    const config = await getParadexConfig();
    const initializedTokens = [];

    // Process each token and set its entry price
    for (const token of tokens) {
      const symbol = token.token_symbol;
      
      // Skip USDC as it always has a price of 1
      if (symbol === 'USDC') {
        await db.query(`
          UPDATE sak_table_portfolio 
          SET entry_price = 1.0, 
              entry_timestamp = CURRENT_TIMESTAMP,
              unrealized_pnl = 0,
              pnl_percentage = 0
          WHERE token_symbol = 'USDC'
        `);
        initializedTokens.push({
          token: symbol,
          entry_price: 1.0
        });
        continue;
      }
      
      try {
        // Get current price and use it as entry price
        const currentPrice = await priceService.getTokenPrice(symbol, config, true);
        
        if (currentPrice === undefined || currentPrice <= 0) {
          console.warn(`⚠️ Could not get a valid price for ${symbol}, skipping initialization`);
          continue;
        }
        
        // Update the database with the entry price
        await db.query(`
          UPDATE sak_table_portfolio 
          SET entry_price = ${currentPrice.toFixed(8)}, 
              entry_timestamp = CURRENT_TIMESTAMP,
              unrealized_pnl = 0,
              pnl_percentage = 0
          WHERE token_symbol = '${symbol}'
        `);
        
        console.log(`✅ Initialized entry price for ${symbol}: $${currentPrice.toFixed(4)}`);
        initializedTokens.push({
          token: symbol,
          entry_price: currentPrice
        });
      } catch (error) {
        console.error(`❌ Error initializing entry price for ${symbol}:`, error);
      }
    }
    
    return { 
      success: true, 
      message: `Initialized entry prices for ${initializedTokens.length} tokens`,
      initialized: initializedTokens
    };
  } catch (error) {
    console.error('❌ Error in initializePortfolioPnL:', error);
    return { 
      success: false, 
      message: `Error initializing PnL: ${error.message || error}`,
      initialized: []
    };
  }
}; 