import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { AVNU_ASSETS } from '../../constants/index.js';
import { AssetAnalysis, AvnuAnalysisParams } from '../../types/index.js';

export class AvnuAnalysisService {
  async fetchAvnuLatestAnalysis(): Promise<AssetAnalysis[]> {
    const assetsParam = AVNU_ASSETS.join(',');
    const apiKey = process.env.BACKEND_API_KEY;

    const host = process.env.AGENT_HOST_BACKEND || '';
    const port = process.env.BACKEND_PORT || '8080';

    const backendUrl = host.startsWith('https')
      ? host
      : `http://${host}:${port}`;

    console.log(
      'URL : ',
      `${backendUrl}/analysis/latest?assets=${assetsParam}&platform=avnu`
    );
    const response = await fetch(
      `${backendUrl}/analysis/latest?assets=${assetsParam}&platform=avnu`,
      {
        headers: {
          accept: '*/*',
          'x-api-key': apiKey ?? '',
        },
      }
    );

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return response.json();
  }
}

export const getAvnuLatestAnalysis = async (
  agent: StarknetAgentInterface,
  params: AvnuAnalysisParams
): Promise<string> => {
  try {
    console.log('Execute getAvnuLatestAnalysis');
    const service = new AvnuAnalysisService();
    const analysis = await service.fetchAvnuLatestAnalysis();
    console.log("The AVNU's latest analysis is : \n", analysis);
    return `timeframes: shortTerm=5m mediumTerm=1h longTerm=4h
momentum: rsi(0-100,>70overbought,<30oversold) macd(momentum,-1to1) stochastic(0-100,>80overbought,<20oversold)
ichimoku: cloudState(above/below/inside) trend indicator, priceDistance(-/+)=price vs cloud distance%
trend: primary.strength(0-1)=trend reliability, action.strength(0-1)=price movement significance
volatility: bbWidth=bollinger width, higher=more volatile
patterns: strength(0-1)=pattern reliability

${JSON.stringify(analysis, null, 2)}`;
  } catch (error) {
    console.error('Error in AvnuLatestAnalysisProvider:', error);
    throw error;
  }
};
