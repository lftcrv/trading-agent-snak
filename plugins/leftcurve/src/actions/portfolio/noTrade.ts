import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { getContainerId } from '../../utils/getContainerId.js';

export interface NoTradeParams {
  explanation: string;
}

/**
 * Function that represents a conscious decision NOT to trade
 * This makes the "no trade" option a concrete action the agent can take
 */
export const noTrade = async (
  agent: StarknetAgentInterface,
  params: NoTradeParams
) => {
  try {
    console.log('🛑 Agent decided NOT to trade');
    console.log('explanation:', params.explanation);

    // Send trading info with explanation
    const decisionObject = {
      tradeId: Date.now().toString(),
      tradeType: 'noTrade',
      decision: {
        action: 'wait',
        explanation: params.explanation || 'No explanation provided',
      },
    };

    const tradingInfoDto = {
      runtimeAgentId: getContainerId(),
      information: decisionObject,
    };

    await sendTradingInfo(tradingInfoDto);

    return {
      success: true,
      message:
        "You've decided not to trade at this time based on your analysis and trading philosophy.",
      explanation: params.explanation,
    };
  } catch (error) {
    console.error('❌ Error in noTrade:', error);
    return { success: false, message: String(error) };
  }
};
