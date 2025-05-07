import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import {
  PlaceOrderMarketParams,
  PlaceOrderParams,
} from '@starknet-agent-kit/plugin-paradex/dist/interfaces/params.js';
import { POService } from '@starknet-agent-kit/plugin-paradex/dist/actions/placeOrderMarket.js';
import {
  getAccount,
  getParadexConfig,
  ParadexAuthenticationError,
} from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { authenticate } from '@starknet-agent-kit/plugin-paradex/dist/utils/paradex-ts/api.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { ParadexOrderError } from '@starknet-agent-kit/plugin-paradex/dist/interfaces/errors.js';
import { addParadexTrade } from '../../utils/paradexTradeHistory.js';
import { checkUsdcBalance } from '../../utils/checkUsdcBalance.js';
import { BBOService } from '../paradexActions/getBBO.js';

export const paradexPlaceOrderMarket = async (
  agent: StarknetAgentInterface,
  params: PlaceOrderMarketParams
) => {
  const service = new POService();
  try {
    const config = await getParadexConfig();
    const account = await getAccount();

    // Check USDC balance if this is a BUY order
    const isBuyOrder = params.side.toLowerCase() === 'long' || 
                      params.side.toLowerCase() === 'buy';
    
    if (isBuyOrder) {
      // Determine token symbol from market (e.g., "ETH-USD-PERP" -> "ETH")
      const tokenSymbol = params.market.split('-')[0];
      
      // For market orders, we need to get the current price from BBO
      try {
        const bboService = new BBOService();
        const bboData = await bboService.fetchMarketBBO(config, params.market);
        
        if (!bboData?.ask) {
          throw new Error(`No valid ask price found for ${params.market}`);
        }
        
        // For buying, we use the ask price
        const askPrice = parseFloat(bboData.ask);
        if (Number.isNaN(askPrice)) {
          throw new Error(`Invalid ask price for ${params.market}`);
        }
        
        // Calculate estimated USDC cost
        const requiredUsdcAmount = Number(params.size) * askPrice;
        
        // Add a larger buffer for market orders (10%) as price can move
        const bufferedAmount = requiredUsdcAmount * 1.10;
        
        // Check if we have enough USDC
        const balanceCheck = await checkUsdcBalance(agent, bufferedAmount, tokenSymbol);
        if (!balanceCheck.success) {
          console.warn(balanceCheck.message);
          return false;
        }
      } catch (error) {
        console.error(`Failed to fetch market price for ${params.market}:`, error);
        throw new Error(`Cannot verify USDC balance: ${error.message}`);
      }
    }

    try {
      account.jwtToken = await authenticate(config, account);
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new ParadexAuthenticationError(
        'Failed to authenticate with Paradex',
        error
      );
    }
    console.info('Authentication successful');
    const orderParams: PlaceOrderParams = {
      market: params.market,
      side:
        params.side.toLowerCase() === 'long' ||
        params.side.toLowerCase() === 'buy'
          ? 'BUY'
          : 'SELL',
      type: 'MARKET',
      size: String(Number(params.size).toFixed(8)),
      instruction: 'GTC',
    };

    console.info('Placing market order with params:', orderParams);
    const result = await service.placeOrder(config, account, orderParams);

    if (result) {
      // Record trade in trading info service
      const tradeObject = {
        tradeId: result.id ?? '0',
        tradeType: 'paradexPlaceOrderMarket',
        trade: {
          market: result.market,
          side: result.side,
          type: result.type,
          size: result.size,
          price: result.price,
          instruction: result.instruction,
          explanation: params.explanation ?? '',
        },
      };
      const tradingInfoDto = {
        runtimeAgentId: getContainerId(),
        information: tradeObject,
      };
      await sendTradingInfo(tradingInfoDto);
      
      // Record trade in local database
      const containerId = getContainerId();
      const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
      if (db) {
        await addParadexTrade(db, {
          market: result.market,
          side: result.side as 'BUY' | 'SELL',
          size: parseFloat(result.size),
          price: parseFloat(result.price),
          order_type: 'MARKET',
          status: result.status || 'PENDING',
          trade_id: result.id,
          timestamp: new Date().toISOString()
        });
        console.log('✅ Trade recorded in database');
      } else {
        console.warn('⚠️ Could not record trade in database - database not found');
      }

      console.log('Order placed successfully:', result);
      console.log('explanation :', params.explanation);
      return true;
    } else {
      console.warn('Failed to cancel order');
      return false;
    }
  } catch (error) {
    if (error instanceof ParadexOrderError) {
      console.error(
        'Market order placement error:',
        error.details || error.message
      );
    } else {
      console.error('Unexpected error during market order placement:', error);
    }
    return false;
  }
};
