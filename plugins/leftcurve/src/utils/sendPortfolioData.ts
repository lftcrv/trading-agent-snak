/**
 * Sends portfolio balance data to the backend API
 */
export const sendPortfolioData = async (
  portfolioBalanceDto: any
): Promise<void> => {
  try {
    const backendPort = process.env.BACKEND_PORT || '8080';
    const isLocal = process.env.LOCAL_DEVELOPMENT === 'TRUE';
    const host = isLocal ? process.env.HOST : '172.17.0.1';
    const apiKey = process.env.BACKEND_API_KEY;

    console.log(
      'Sending portfolio balance to KPI endpoint:',
      `http://${host}:${backendPort}/api/kpi`
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(`http://${host}:${backendPort}/api/kpi`, {
      method: 'POST',
      headers,
      body: JSON.stringify(portfolioBalanceDto),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to save portfolio data: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log('Portfolio balance sent successfully to KPI endpoint:', data);
  } catch (error) {
    console.error(
      'Error sending portfolio balance to KPI endpoint:',
      error.response?.data || error.message
    );
  }
};
