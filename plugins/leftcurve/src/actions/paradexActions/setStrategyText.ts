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
    console.log('🧠 TRADING STRATEGY: Agent is setting entry/exit conditions for assigned assets');
    console.log('📝 STRATEGY DEFINITION:');
    console.log(params.strategy_text);
    console.log('---');
    
    // Check if the strategy contains bullet points
    if (!params.strategy_text.includes('-')) {
      console.warn('⚠️ WARNING: Strategy text does not appear to contain bullet points (-). Strategy should ideally have one bullet point per asset.');
    }
    
    // Check if strategy seems to address both entry and exit conditions
    const hasEntryConditions = params.strategy_text.toLowerCase().includes('buy') || 
                               params.strategy_text.toLowerCase().includes('enter') || 
                               params.strategy_text.toLowerCase().includes('long');
    
    const hasExitConditions = params.strategy_text.toLowerCase().includes('sell') || 
                              params.strategy_text.toLowerCase().includes('exit') || 
                              params.strategy_text.toLowerCase().includes('profit') ||
                              params.strategy_text.toLowerCase().includes('take profit');
    
    if (!hasEntryConditions) {
      console.warn('⚠️ WARNING: Strategy may not clearly define ENTRY conditions. Consider updating with clear buy/entry signals.');
    }
    
    if (!hasExitConditions) {
      console.warn('⚠️ WARNING: Strategy may not clearly define EXIT conditions. Consider updating with clear sell/exit/take profit signals.');
    }
    
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
      console.log('✅ TRADING STRATEGY: Successfully recorded entry/exit strategy');
      console.log('📊 This strategy will guide future trading decisions to ensure disciplined trading');
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