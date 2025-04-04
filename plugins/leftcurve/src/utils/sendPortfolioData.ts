/**
 * Sends portfolio balance data to the backend API
 */
export const sendPortfolioData = async (
  portfolioBalanceDto: any
): Promise<void> => {
  try {
    const backendPort = process.env.BACKEND_PORT || '8080';
    const host = process.env.AGENT_HOST_BACKEND;
    const apiKey = process.env.BACKEND_API_KEY;

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
  } catch (error) {
    console.error(
      'Error sending portfolio balance to KPI endpoint:',
      error.response?.data || error.message
    );
  }
};
