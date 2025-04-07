import { StarknetAgentInterface } from '@starknet-agent-kit/agents';

export const getAnalysisParadex = async (agent: StarknetAgentInterface) => {
  try {
    const apiKey = process.env.BACKEND_API_KEY;
    const host = process.env.AGENT_HOST_BACKEND || '';
    const port = process.env.BACKEND_PORT || '8080';

    const backendUrl = host.startsWith('https')
      ? host
      : `http://${host}:${port}`;

    if (!apiKey) {
      console.error('Backend API key not set');
      return 'Unable to fetch analysis - missing API key.';
    }

    const assetsQuery = 'BTC,ETH,STRK,AAVE,AI16Z';

    try {
      console.log(
        'url',
        `${backendUrl}/analysis/latest?assets=${assetsQuery}&platform=paradex`
      );
      const response = await fetch(
        `${backendUrl}/analysis/latest?assets=${assetsQuery}&platform=paradex`,
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
        return 'No analysis data available for the requested assets.';
      }

      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.log('Error fetching technical analysis:', error);
      return 'Failed to fetch technical analysis data. Please try again later.';
    }
  } catch (error) {
    console.log('Technical Analysis Provider error:', error);
    return 'Unable to process technical analysis request.';
  }
};
