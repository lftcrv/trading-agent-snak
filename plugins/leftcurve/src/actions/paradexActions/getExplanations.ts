import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { getContainerId } from '../../utils/getContainerId.js';
import { getLatestAgentExplanations, AgentExplanation } from '../../utils/agentExplanations.js';

export interface GetExplanationsParams {
  // No parameters needed for this action
}

interface ExplanationsResult {
  success: boolean;
  message: string;
  data: {
    explanations: AgentExplanation[];
    count: number;
  };
}

/**
 * Get the latest agent explanations (up to 3) from the database
 */
export const getAgentExplanations = async (
  agent: StarknetAgentInterface,
  params: GetExplanationsParams
): Promise<ExplanationsResult> => {
  try {
    console.log('🧠 AGENT STRATEGY: Fetching previous agent explanations to maintain strategy consistency');
    
    const containerId = getContainerId();
    const db = await agent.getDatabaseByName(`leftcurve_db_${containerId}`);
    
    if (!db) {
      throw new Error(`leftcurve_db_${containerId} not found`);
    }
    
    // Get latest explanations
    const explanations = await getLatestAgentExplanations(db);
    
    if (explanations.length === 0) {
      console.log('📝 AGENT STRATEGY: No previous explanations found. This is the first strategic decision.');
      return {
        success: true,
        message: 'No explanations found. The agent has not provided any strategy explanations yet.',
        data: {
          explanations: [],
          count: 0
        }
      };
    }
    
    // Format explanations with time ago for display
    const formattedExplanations = explanations.map((explanation) => {
      return {
        explanation: explanation.explanation,
        timestamp: explanation.timestamp,
        market: explanation.market,
        reason: explanation.reason,
        analysis: {
          price: explanation.price,
          volume: explanation.volume,
          volatility: explanation.volatility,
          trend: explanation.trend
        },
        decision_type: explanation.decision_type
      };
    });
    
    // Log detailed formatted explanations for debugging
    console.log('🧠 AGENT STRATEGY: Retrieved previous strategy explanations:');
    formattedExplanations.forEach((explanation, index) => {
      const timeAgo = getTimeAgo(new Date(explanation.timestamp || Date.now()));
      console.log(`📝 Explanation #${index + 1} (${timeAgo}):`);
      console.log(`Explanation: ${explanation.explanation}`);
      console.log('---');
    });

    // Create a nice summary message
    const summaryLines = formattedExplanations.map((explanation, index) => {
      const timeAgo = getTimeAgo(new Date(explanation.timestamp || Date.now()));
      const marketInfo = explanation.market ? `[${explanation.market}] ` : '';
      return `${index + 1}. ${timeAgo} ${marketInfo}: ${explanation.explanation.substring(0, 100)}${explanation.explanation.length > 100 ? '...' : ''}`;
    });
    
    const summary = `Found ${explanations.length} recent strategy explanations:\n\n${summaryLines.join('\n')}`;
    console.log('🧠 AGENT STRATEGY: Successfully retrieved previous strategy explanations to guide current decision');
    
    return {
      success: true,
      message: summary,
      data: {
        explanations: formattedExplanations,
        count: explanations.length
      }
    };
  } catch (error) {
    console.error('❌ Error getting agent explanations:', error);
    return {
      success: false,
      message: `Failed to get explanations: ${error instanceof Error ? error.message : String(error)}`,
      data: {
        explanations: [],
        count: 0
      }
    };
  }
};

/**
 * Format a date into a human-readable "time ago" string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
} 