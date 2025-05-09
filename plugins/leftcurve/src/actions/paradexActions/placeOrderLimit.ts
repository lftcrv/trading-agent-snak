import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import {
  PlaceOrderLimitParams,
  PlaceOrderParams
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
import { checkUsdcBalance } from '../../utils/checkUsdcBalance.js';
import { BBOService } from '../paradexActions/getBBO.js';

export const paradexPlaceOrderLimit = async (
  agent: StarknetAgentInterface,
  params: PlaceOrderLimitParams
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
      
      let requiredUsdcAmount = 0;
      
      // If price is specified, use it directly
      if (params.price) {
        requiredUsdcAmount = Number(params.size) * Number(params.price);
      } else {
        // Otherwise, we need to get the current price from BBO
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
          
          requiredUsdcAmount = Number(params.size) * askPrice;
        } catch (error) {
          console.error(`Failed to fetch market price for ${params.market}:`, error);
          throw new Error(`Cannot verify USDC balance: ${error.message}`);
        }
      }
      
      // Add a small buffer for price fluctuations (5%)
      requiredUsdcAmount = requiredUsdcAmount * 1.05;
      
      // Check if we have enough USDC
      const balanceCheck = await checkUsdcBalance(agent, requiredUsdcAmount, tokenSymbol);
      if (!balanceCheck.success) {
        console.warn(balanceCheck.message);
        return false;
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
      type: 'LIMIT',
      size: String(Number(params.size).toFixed(8)),
      instruction: 'GTC',
      ...(params.price && { price: String(Number(params.price).toFixed(8)) }),
    };

    console.info('Placing order with params:', orderParams);
    const result = await service.placeOrder(config, account, orderParams);

    if (result) {
      const tradeObject = {
        tradeId: result.id ?? '0',
        tradeType: 'paradexPlaceOrderLimit',
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
      console.log('Order placed successfully:', result);
      console.log('explanation :', params.explanation);
      return true;
    } else {
      console.warn('Failed to cancel order');
      return false;
    }
  } catch (error) {
    if (error instanceof ParadexOrderError) {
      console.error('Order placement error:', error.details || error.message);
    } else {
      console.error('Unexpected error during order placement:', error);
    }
    return false;
  }
};
