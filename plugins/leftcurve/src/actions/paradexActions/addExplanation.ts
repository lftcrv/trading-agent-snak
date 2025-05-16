import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { addAgentExplanation as addExplanationToDb } from '../../utils/agentExplanations.js';

export interface AddExplanationParams {
  explanation: string;
}

interface ExplanationResult {
  success: boolean;
  message: string;
  data: {
    explanation: string;
  };
}

/**
 * Add an agent's explanation/reasoning about its strategy to the database
 * 
 * NOTE: Before calling this, always retrieve previous explanations with getAgentExplanations.
 * Your new explanation should incorporate key elements from your previous strategies 
 * (last 3 explanations) to maintain consistency over time. Craft your explanation as 
 * a comprehensive summary that builds upon previous decisions while adapting to current 
 * market conditions.
 */
export const addAgentExplanation = async (
  agent: StarknetAgentInterface,
  params: AddExplanationParams
): Promise<ExplanationResult> => {
  try {
    console.log('🧠 AGENT STRATEGY: Recording new agent strategic explanation for future reference');
    console.log('📝 STRATEGY CONTENT:');
    console.log(params.explanation);
    console.log('---');
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Trim explanation if it's too long (DB might have character limits)
    const trimmedExplanation = params.explanation.slice(0, 10000);
    
    // Add explanation to database
    const result = await addExplanationToDb(db, trimmedExplanation);
    
    if (result.success) {
      console.log('✅ AGENT STRATEGY: Successfully recorded strategic explanation to maintain continuity in decision-making');
      return {
        success: true,
        message: 'Successfully added explanation to database',
        data: { explanation: trimmedExplanation }
      };
    } else {
      console.error('❌ AGENT STRATEGY: Failed to record strategic explanation:', result.message);
      return {
        success: false,
        message: `Failed to add explanation: ${result.message}`,
        data: { explanation: trimmedExplanation }
      };
    }
  } catch (error) {
    console.error('❌ AGENT STRATEGY: Error adding explanation to database:', error);
    return {
      success: false,
      message: `Failed to add explanation: ${error instanceof Error ? error.message : String(error)}`,
      data: { explanation: params.explanation }
    };
  }
}; 