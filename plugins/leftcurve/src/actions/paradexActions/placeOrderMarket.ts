import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import {
  PlaceOrderMarketParams,
  PlaceOrderParams,
} from '../../../../paradex/src/interfaces/params.js';
import { POService } from '../../../../paradex/src/actions/placeOrderMarket.js';
import {
  getAccount,
  getParadexConfig,
  ParadexAuthenticationError,
} from '../../../../paradex/src/utils/utils.js';
import { authenticate } from '../../../../paradex/src/utils/paradex-ts/api.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { ParadexOrderError } from '../../../../paradex/src/interfaces/errors.js';

export const paradexPlaceOrderMarket = async (
  agent: StarknetAgentInterface,
  params: PlaceOrderMarketParams
) => {
  const service = new POService();
  try {
    const config = await getParadexConfig();
    const account = await getAccount();

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
