import { PostgresAdaptater } from '@starknet-agent-kit/agents';
import { getContainerId } from './getContainerId.js';

export interface ParadexTrade {
  market: string;
  side: 'BUY' | 'SELL' | 'SWAP';
  size: number;
  price: number;
  order_type: 'LIMIT' | 'MARKET';
  status: string;
  trade_id?: string;
  timestamp?: Date | string;
}

/**
 * Add a new trade to the paradex_trades table
 */
export const addParadexTrade = async (
  database: PostgresAdaptater,
  trade: ParadexTrade
): Promise<{ success: boolean; message: string }> => {
  try {
    const insertResult = await database.insert({
      table_name: 'paradex_trades',
      fields: new Map([
        ['market', trade.market],
        ['side', trade.side],
        ['size', trade.size.toString()],
        ['price', trade.price.toString()],
        ['order_type', trade.order_type],
        ['status', trade.status],
        ['trade_id', trade.trade_id || null],
      ]),
    });

    if (insertResult.status === 'success') {
      console.log('✅ Trade added to paradex_trades table');
      
      // Keep only the latest 5 trades
      await pruneTradeHistory(database);
      
      return { success: true, message: 'Trade recorded successfully' };
    } else {
      console.error('❌ Failed to add trade:', insertResult);
      return { success: false, message: `Failed to add trade: ${insertResult.status}` };
    }
  } catch (error) {
    console.error('❌ Error adding trade to database:', error);
    return { 
      success: false, 
      message: `Error adding trade to database: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
};

/**
 * Keep only the latest 5 trades in the paradex_trades table
 */
export const pruneTradeHistory = async (
  database: PostgresAdaptater
): Promise<void> => {
  try {
    // Count total trades
    const countResult = await database.select({
      FROM: ['paradex_trades'],
      SELECT: ['COUNT(*) as count'],
    });
    
    if (
      countResult.status === 'success' &&
      countResult.query &&
      countResult.query.rows.length > 0
    ) {
      const count = parseInt(countResult.query.rows[0].count);
      
      // If more than 5 trades, delete the oldest
      if (count > 5) {
        const deleteQuery = `
          DELETE FROM paradex_trades 
          WHERE id IN (
            SELECT id FROM paradex_trades 
            ORDER BY timestamp ASC 
            LIMIT ${count - 5}
          )
        `;
        
        await database.query(deleteQuery);
        console.log(`✅ Pruned trade history to keep only the latest 5 trades`);
      }
    }
  } catch (error) {
    console.error('❌ Error pruning trade history:', error);
  }
};

/**
 * Get the latest trades from the paradex_trades table (up to 8)
 */
export const getLatestParadexTrades = async (
  database: PostgresAdaptater
): Promise<ParadexTrade[]> => {
  try {
    // Use query instead of select to use ORDER BY
    const tradesQuery = `
      SELECT * FROM paradex_trades 
      ORDER BY timestamp DESC 
      LIMIT 8
    `;
    
    const tradesResult = await database.query(tradesQuery);
    
    if (
      tradesResult.status === 'success' &&
      tradesResult.query &&
      tradesResult.query.rows.length > 0
    ) {
      const mappedTrades = tradesResult.query.rows.map((row) => ({
        market: row.market,
        side: row.side as 'BUY' | 'SELL' | 'SWAP',
        size: parseFloat(row.size),
        price: parseFloat(row.price),
        order_type: row.order_type as 'LIMIT' | 'MARKET',
        status: row.status,
        trade_id: row.trade_id,
        timestamp: row.timestamp,
      }));
      
      return mappedTrades;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error getting latest trades:', error);
    return [];
  }
};

/**
 * Helper function to get the database instance
 */
export const getParadexTradeDatabase = async (): Promise<PostgresAdaptater | undefined> => {
  try {
    const containerId = getContainerId();
    // We're reusing the leftcurve database
    // @ts-ignore
    const agent = global.agent;
    return agent?.getDatabaseByName(`leftcurve_db_${containerId}`);
  } catch (error) {
    console.error('❌ Error getting database instance:', error);
    return undefined;
  }
};

/**
 * Debug function to check the structure of the paradex_trades table
 */
export const inspectParadexTradesTable = async (
  database: PostgresAdaptater
): Promise<any> => {
  try {
    console.log('🔎 Inspecting paradex_trades table structure...');
    
    // Get column info
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'paradex_trades'
      ORDER BY ordinal_position;
    `;
    
    const columnsResult = await database.query(columnsQuery);
    
    // Count total records
    const countQuery = `SELECT COUNT(*) as count FROM paradex_trades;`;
    const countResult = await database.query(countQuery);
    
    let count = 0;
    if (countResult.status === 'success' && countResult.query) {
      count = parseInt(countResult.query.rows[0].count);
    }
    
    // Get a sample record (latest one)
    const sampleQuery = `SELECT * FROM paradex_trades ORDER BY id DESC LIMIT 1;`;
    const sampleResult = await database.query(sampleQuery);
    
    return {
      success: true,
      columns: columnsResult.status === 'success' ? columnsResult.query?.rows : [],
      count: count,
      sampleRecord: (sampleResult.status === 'success' && sampleResult.query && sampleResult.query.rows.length > 0) 
        ? sampleResult.query.rows[0] 
        : null
    };
  } catch (error) {
    console.error('❌ Error inspecting paradex_trades table:', error);
    return { success: false, error: String(error) };
  }
}; 