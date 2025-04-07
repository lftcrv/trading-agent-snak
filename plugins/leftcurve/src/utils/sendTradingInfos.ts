export const sendTradingInfo = async (tradingInfoDto: any): Promise<void> => {
  try {
    const host = process.env.AGENT_HOST_BACKEND || '';
    const port = process.env.BACKEND_PORT || '8080';

    const backendUrl = host.startsWith('https')
      ? host
      : `http://${host}:${port}`;

    const apiKey = process.env.BACKEND_API_KEY;

    console.log(
      'Sending trading info to:',
      `${backendUrl}/api/trading-information`
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(`${backendUrl}/api/trading-information`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tradingInfoDto),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to save trading info: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
  } catch (error) {
    console.error(
      'Error saving trading information:',
      error.response?.data || error.message
    );
  }
};
