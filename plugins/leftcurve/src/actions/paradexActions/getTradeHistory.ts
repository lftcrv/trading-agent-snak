import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { getLatestParadexTrades, ParadexTrade } from '../../utils/paradexTradeHistory.js';

export interface GetTradeHistoryParams {
  // No parameters needed for this action
}

/**
 * Get the latest Paradex trades (up to 8) from the database
 */
export const getParadexTradeHistory = async (
  agent: StarknetAgentInterface,
  params: GetTradeHistoryParams
) => {
  try {
    console.log('🔍 Fetching Paradex trade history');
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Get latest trades
    const trades = await getLatestParadexTrades(db);
    
    if (trades.length === 0) {
      return {
        success: true,
        message: 'No trade history found. You have not executed any trades yet.',
        data: {
          trades: [] as ParadexTrade[],
          count: 0
        }
      };
    }
    
    // Format trades for display
    const formattedTrades = trades.map((trade) => {
      return {
        market: trade.market,
        side: trade.side,
        size: trade.size,
        price: trade.price,
        value: ((trade.side as string) === 'SWAP' ? 
          // For swaps, the value is based on the size times the directly shown exchange rate
          trade.size : 
          // For buys and sells, it's a direct dollar value (size * price)
          trade.size * trade.price
        ).toFixed(2),
        order_type: trade.order_type,
        status: trade.status,
        trade_id: trade.trade_id || 'N/A',
        timestamp: trade.timestamp
      };
    });
    
    // Log formatted trades
    console.log('🔄 Formatted trades:', JSON.stringify(formattedTrades, null, 2));

    // Create a nice summary message
    const summaryLines = formattedTrades.map((trade, index) => {
      const timeAgo = getTimeAgo(new Date(trade.timestamp || Date.now()));
      
      // Format the display differently based on trade side
      if ((trade.side as string) === 'SWAP') {
        // For SWAP trades, extract the tokens from the market string
        const [tokens] = trade.market.split('-');
        const [fromToken, toToken] = tokens.split('/');
        return `${index + 1}. ${timeAgo}: SWAP ${trade.size.toFixed(6)} ${fromToken} ➔ ${toToken} (Value: $${trade.value})`;
      } else {
        // For BUY/SELL trades
        const baseToken = trade.market.split('-')[0];
        return `${index + 1}. ${timeAgo}: ${trade.side} ${trade.size.toFixed(6)} ${baseToken} @ $${trade.price.toFixed(2)} (Value: $${trade.value})`;
      }
    });

    // Check for revert trades (token swapping back and forth)
    const revertTradeWarning = detectRevertTrades(trades);
    
    const summary = `Found ${trades.length} recent Paradex trades (showing up to 8):\n\n${summaryLines.join('\n')}`;
    console.log(summary);
    
    return {
      success: true,
      message: summary,
      data: {
        trades: formattedTrades,
        count: trades.length,
        hasRevertTrades: !!revertTradeWarning,
        revertTradeWarning: revertTradeWarning // Include the warning in the data object, invisible to the user
      }
    };
  } catch (error) {
    console.error('❌ Error getting Paradex trade history:', error);
    return {
      success: false,
      message: `Failed to get trade history: ${error instanceof Error ? error.message : String(error)}`,
      data: {
        trades: [] as ParadexTrade[],
        count: 0
      }
    };
  }
};

/**
 * Detect if there are revert trades in the trade history
 * A revert trade is when a token is swapped and then swapped back within a short time
 */
function detectRevertTrades(trades: ParadexTrade[]): string | null {
  // We only care about SWAP trades
  const swapTrades = trades.filter(trade => (trade.side as string) === 'SWAP');
  if (swapTrades.length < 2) return null;

  // Create a map of token pairs that have been swapped
  const tokenPairs: Record<string, Array<{timestamp: Date | string, direction: string}>> = {};
  
  for (const trade of swapTrades) {
    if (trade.market.includes('-SWAP')) {
      const [tokens] = trade.market.split('-');
      const [fromToken, toToken] = tokens.split('/');
      
      // Create a normalized token pair key (alphabetically sorted)
      const tokenPair = [fromToken, toToken].sort().join('/');
      
      if (!tokenPairs[tokenPair]) {
        tokenPairs[tokenPair] = [];
      }
      
      // Record the direction of the swap (fromToken → toToken)
      tokenPairs[tokenPair].push({
        timestamp: trade.timestamp || new Date(),
        direction: `${fromToken}→${toToken}`
      });
    }
  }
  
  // Check each token pair for reverse swaps
  const revertTrades: string[] = [];
  
  for (const [tokenPair, swaps] of Object.entries(tokenPairs)) {
    if (swaps.length >= 2) {
      // Check for opposite directions
      const directions = new Set(swaps.map(swap => swap.direction));
      if (directions.size > 1) {
        // Get the token names
        const [token1, token2] = tokenPair.split('/');
        revertTrades.push(`${token1}/${token2}`);
      }
    }
  }
  
  if (revertTrades.length > 0) {
    return `WARNING: Revert trades detected for token pairs: ${revertTrades.join(', ')}. Avoid trading back and forth between the same tokens as this typically reduces profitability and indicates lack of strategic conviction.`;
  }
  
  return null;
}

/**
 * Get a human-readable time ago string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
} 