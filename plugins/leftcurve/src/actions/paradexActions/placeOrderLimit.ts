import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import {
  PlaceOrderLimitParams,
  PlaceOrderParams
} from '@starknet-agent-kit/plugin-paradex/src/interfaces/params.js';
import { POService } from '@starknet-agent-kit/plugin-paradex/src/actions/placeOrderMarket.js';
import {
  getAccount,
  getParadexConfig,
  ParadexAuthenticationError,
} from '@starknet-agent-kit/plugin-paradex/src/utils/utils.js';
import { authenticate } from '@starknet-agent-kit/plugin-paradex/src/utils/paradex-ts/api.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { ParadexOrderError } from '@starknet-agent-kit/plugin-paradex/src/interfaces/errors.js';

export const paradexPlaceOrderLimit = async (
  agent: StarknetAgentInterface,
  params: PlaceOrderLimitParams
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
