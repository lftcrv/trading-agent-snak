import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { getLatestStrategyText, getTimeAgo } from '../../utils/strategyText.js';

export interface GetStrategyTextParams {
  // No parameters needed for this action
}

interface StrategyTextResult {
  success: boolean;
  message: string;
  data: {
    strategy_text: string | null;
    timestamp: string | null;
    exists: boolean;
  };
}

/**
 * Get the agent's last saved entry/exit strategy text
 */
export const getStrategyText = async (
  agent: StarknetAgentInterface,
  params: GetStrategyTextParams
): Promise<StrategyTextResult> => {
  try {
    console.log('🧠 TRADING STRATEGY: Agent is consulting previously defined entry/exit rules');
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Get latest strategy text
    const strategyData = await getLatestStrategyText(db);
    
    if (!strategyData) {
      console.log('📝 TRADING STRATEGY: No strategy found. Agent must define entry/exit conditions before trading.');
      console.log('⚠️ WARNING: Trading without a defined strategy may lead to inconsistent decisions.');
      return {
        success: true,
        message: 'No strategy found. You need to define your entry/exit strategy before trading.',
        data: {
          strategy_text: null,
          timestamp: null,
          exists: false
        }
      };
    }
    
    // Format with time ago for display
    const timeAgo = strategyData.timestamp 
      ? getTimeAgo(new Date(strategyData.timestamp)) 
      : 'unknown time';

    console.log('🧠 TRADING STRATEGY: Retrieved agent\'s trading plan:');
    console.log(`📝 Strategy (created ${timeAgo}):`);
    console.log(strategyData.strategy_text);
    console.log('---');
    console.log('📊 REMINDER: All trading decisions should align with this strategy for consistency');
    
    return {
      success: true,
      message: `Retrieved your trading strategy (created ${timeAgo}):`,
      data: {
        strategy_text: strategyData.strategy_text,
        timestamp: strategyData.timestamp?.toString() || null,
        exists: true
      }
    };
  } catch (error) {
    console.error('❌ TRADING STRATEGY: Error retrieving strategy from database:', error);
    return {
      success: false,
      message: `Failed to retrieve strategy: ${error instanceof Error ? error.message : String(error)}`,
      data: {
        strategy_text: null,
        timestamp: null,
        exists: false
      }
    };
  }
}; 