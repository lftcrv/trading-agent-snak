import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { CancelOrderParams } from '../../../../paradex/src/interfaces/params.js';
import { CancelOrderService } from '../../../../paradex/src/actions/cancelOrder.js';
import {
  getAccount,
  getParadexConfig,
  ParadexAuthenticationError,
} from '../../../../paradex/src/utils/utils.js';
import { authenticate } from '../../../../paradex/src/utils/paradex-ts/api.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { ParadexCancelError } from '../../../../paradex/src/interfaces/errors.js';

export const paradexCancelOrder = async (
  agent: StarknetAgentInterface,
  params: CancelOrderParams
) => {
  const service = new CancelOrderService();
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

    const result = await service.cancelOrder(config, account, params.orderId);
    if (result) {
      const tradeObject = {
        tradeId: params.orderId,
        tradeType: 'paradexCancelOrder',
        explanation: params.explanation ?? '',
      };
      const tradingInfoDto = {
        runtimeAgentId: getContainerId(),
        information: tradeObject,
      };
      await sendTradingInfo(tradingInfoDto);
      console.log('Order cancelled successfully');
      console.log('explanation :', params.explanation);
      return true;
    } else {
      console.warn('Failed to cancel order');
      return false;
    }
  } catch (error) {
    if (error instanceof ParadexCancelError) {
      console.error('Cancel order error:', error.details || error.message);
    } else {
      console.error('Unexpected error during order cancellation:', error);
    }
    return false;
  }
};
