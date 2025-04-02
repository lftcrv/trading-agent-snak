import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { BalanceService } from '@starknet-agent-kit/plugin-paradex/dist/actions/fetchAccountBalance.js';
import {
  getAccount,
  getParadexConfig,
  ParadexAuthenticationError,
} from '@starknet-agent-kit/plugin-paradex/dist/utils/utils.js';
import { ParadexBalanceError } from '@starknet-agent-kit/plugin-paradex/dist/interfaces/errors.js';
import { sendParadexAccountBalanceData } from '../../utils/sendParadexAccountBalanceData.js';

// import { authenticate } from '@starknet-agent-kit/plugin-paradex/dist/utils/paradex-ts/api.js';
import { authenticate } from '@starknet-agent-kit/plugin-paradex/dist/utils/paradex-ts/api.js';
import { getContainerId } from '../../utils/getContainerId.js';

export const sendParadexBalance = async (agent: StarknetAgentInterface) => {
  console.info('Calling sendParadexBalance');
  console.log('Calling sendParadexBalance');
  const service = new BalanceService();
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

    const balanceData = await service.fetchAccountBalance(config, account);

    const formattedResponse = service.formatBalanceResponse(
      balanceData.results
    );
    console.log(formattedResponse.text);

    const accountBalanceDto = {
      runtimeAgentId: getContainerId(),
      balanceInUSD: formattedResponse.balance?.size,
    };
    console.info('accountBalanceDto', accountBalanceDto);
    console.log('accountBalanceDto', accountBalanceDto);
    await sendParadexAccountBalanceData(accountBalanceDto);
    return true;
  } catch (error) {
    if (error instanceof ParadexBalanceError) {
      console.error('Balance error:', error.details || error.message);
    } else {
      console.error('Unexpected error fetching balance:', error);
    }
    return {
      success: false,
      data: null,
      text: 'Failed to fetch account balance. Please try again later.',
    };
  }
};
