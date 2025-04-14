import { getContainerId } from '../../utils/getContainerId.js';
import { StarknetAgentInterface } from '@starknet-agent-kit/agents';

export const getAnalysisForAgent = async (agent: StarknetAgentInterface) => {
  try {
    const apiKey = process.env.BACKEND_API_KEY;
    const host = process.env.AGENT_HOST_BACKEND || '';
    const port = process.env.BACKEND_PORT || '8080';
    const containerId = getContainerId();
    const runtimeAgentId = process.env.RUNTIME_AGENT_ID || containerId;

    const backendUrl = host.startsWith('https')
      ? host
      : `http://${host}:${port}`;

    if (!apiKey) {
      console.error('Backend API key not set');
      return 'Unable to fetch analysis - missing API key.';
    }

    if (!runtimeAgentId) {
      console.error('Runtime agent ID not set');
      return 'Unable to fetch analysis - missing agent ID.';
    }

    try {
      console.log(
        'Fetching analysis for agent:',
        `${backendUrl}/analysis/agent/${runtimeAgentId}?platform=paradex`
      );

      const response = await fetch(
        `${backendUrl}/analysis/agent/${runtimeAgentId}?platform=paradex`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'x-api-key': apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Backend request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        return 'No analysis data available for my selected cryptocurrencies.';
      }

      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.log('Error fetching analysis for agent:', error);
      return 'Failed to fetch analysis data. Please try again later.';
    }
  } catch (error) {
    console.log('Analysis Provider error:', error);
    return 'Unable to process analysis request.';
  }
};
