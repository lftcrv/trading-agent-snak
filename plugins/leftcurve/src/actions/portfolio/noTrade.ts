import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { sendTradingInfo } from '../../utils/sendTradingInfos.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { addAgentExplanation } from '../../utils/agentExplanations.js';
import { isPnLCheckRecent } from '../../utils/lastPnLCheck.js';

export interface NoTradeParams {
  explanation: string;
  market?: string; // Optional market that was analyzed
  reason?: string; // Specific reason for not trading (e.g., "UNFAVORABLE_CONDITIONS", "INSUFFICIENT_BALANCE", etc.)
  analysis?: {
    price?: number;
    volume?: number;
    volatility?: number;
    trend?: string;
  };
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
    console.log('📉 No trade decision with explanation:', params.explanation);
    
    // Check if a PnL check was performed recently
    if (!isPnLCheckRecent()) {
      console.warn('⚠️ WARNING: No recent PnL check detected before deciding not to trade. It is highly recommended to check PnL before making trading decisions.');
      console.warn('⚠️ The agent should call get_portfolio_pnl before deciding not to trade to make informed decisions.');
    }
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    if (!db) throw new Error(`leftcurve_db_${containerId} not found`);
    
    // Record the explanation in the agent_explanations table
    await addAgentExplanation(db, params.explanation, {
      market: params.market,
      reason: params.reason,
      price: params.analysis?.price,
      volume: params.analysis?.volume,
      volatility: params.analysis?.volatility,
      trend: params.analysis?.trend,
      decision_type: 'NO_TRADE'
    });

    console.log('🛑 Agent decided NOT to trade');
    console.log('explanation:', params.explanation);

    // Send trading info with enhanced explanation format
    const decisionObject = {
      tradeId: Date.now().toString(),
      tradeType: 'noTrade',
      trade: {
        action: 'wait',
        market: params.market || 'N/A',
        reason: params.reason || 'STRATEGIC_DECISION',
        explanation: params.explanation || 'No explanation provided',
        analysis: params.analysis || {
          price: 0,
          volume: 0,
          volatility: 0,
          trend: 'N/A'
        }
      },
    };

    const tradingInfoDto = {
      runtimeAgentId: getContainerId(),
      information: decisionObject,
    };

    // Send trading info to backend
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
