import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { saveStrategyText } from '../../utils/strategyText.js';

export interface SetStrategyTextParams {
  strategy_text: string;
}

interface StrategyTextResult {
  success: boolean;
  message: string;
  data: {
    strategy_text: string;
  };
}

/**
 * Allow the agent to save its entry/exit strategy as a bulleted text
 */
export const setStrategyText = async (
  agent: StarknetAgentInterface,
  params: SetStrategyTextParams
): Promise<StrategyTextResult> => {
  try {
    console.log('🧠 TRADING STRATEGY: Recording agent\'s entry/exit strategy for assets');
    console.log('📝 STRATEGY CONTENT:');
    console.log(params.strategy_text);
    console.log('---');
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Trim strategy text if it's too long (DB might have character limits)
    const trimmedStrategyText = params.strategy_text.slice(0, 10000);
    
    // Save strategy text to database
    const result = await saveStrategyText(db, trimmedStrategyText);
    
    if (result.success) {
      console.log('✅ TRADING STRATEGY: Successfully recorded entry/exit strategy for future reference');
      return {
        success: true,
        message: 'Successfully saved strategy to database',
        data: { strategy_text: trimmedStrategyText }
      };
    } else {
      console.error('❌ TRADING STRATEGY: Failed to record strategy:', result.message);
      return {
        success: false,
        message: `Failed to save strategy: ${result.message}`,
        data: { strategy_text: trimmedStrategyText }
      };
    }
  } catch (error) {
    console.error('❌ TRADING STRATEGY: Error saving strategy to database:', error);
    return {
      success: false,
      message: `Failed to save strategy: ${error instanceof Error ? error.message : String(error)}`,
      data: { strategy_text: params.strategy_text }
    };
  }
}; 