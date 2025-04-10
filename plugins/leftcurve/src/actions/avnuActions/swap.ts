import { executeSwap, fetchQuotes, QuoteRequest, Quote } from '@avnu/avnu-sdk';
import { Account } from 'starknet';
import { StarknetAgentInterface } from '@starknet-agent-kit/agents';
import { SwapParams, SwapResult } from '../../types/index.js';
import { getContainerId } from '../../utils/getContainerId.js';
import { TokenService } from '@starknet-agent-kit/plugin-avnu/src/actions/fetchTokens.js';
import { ApprovalService } from '@starknet-agent-kit/plugin-avnu/src/actions/approval.js';
import {
  DEFAULT_QUOTE_SIZE,
  SLIPPAGE_PERCENTAGE,
} from '@starknet-agent-kit/plugin-avnu/src/constants/index.js';
import { ContractInteractor } from '@starknet-agent-kit/plugin-avnu/src/utils/contractInteractor.js';
import { TransactionMonitor } from '@starknet-agent-kit/plugin-avnu/src/utils/transactionMonitor.js';

/**
 * Service handling token swap operations using AVNU SDK
 * @class SwapService
 */
export class SwapService {
  private tokenService: TokenService;
  private approvalService: ApprovalService;

  /**
   * Creates an instance of SwapService
   * @param {StarknetAgentInterface} agent - The Starknet agent for blockchain interactions
   * @param {string} walletAddress - The wallet address executing the swaps
   */
  constructor(
    private agent: StarknetAgentInterface,
    private walletAddress: string
  ) {
    this.tokenService = new TokenService();
    this.approvalService = new ApprovalService(agent);
  }

  /**
   * Initializes the token service
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    await this.tokenService.initializeTokens();
  }

  /**
   * Safely stringifies objects containing BigInt values
   * @private
   * @param {unknown} obj - Object to stringify
   * @returns {string} JSON string with BigInt values converted to strings
   */
  private safeStringify(obj: unknown): string {
    return JSON.stringify(
      obj,
      (key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2
    );
  }

  /**
   * Extracts spender address from a quote
   * @private
   * @param {Quote} quote - The quote containing route information
   * @returns {string|undefined} The spender address if available
   */
  private extractSpenderAddress(quote: Quote): string | undefined {
    if (quote.routes?.length > 0) {
      const mainRoute = quote.routes[0];
      return mainRoute.address;
    }

    return undefined;
  }

  /**
   * Executes a token swap transaction
   * @param {SwapParams} params - The swap parameters
   * @param {StarknetAgentInterface} agent - The Starknet agent
   * @returns {Promise<SwapResult>} The result of the swap operation
   */
  async executeSwapTransaction(
    params: SwapParams,
    agent: StarknetAgentInterface
  ): Promise<SwapResult> {
    try {
      await this.initialize();

      const account = new Account(
        this.agent.getProvider(),
        this.walletAddress,
        this.agent.getAccountCredentials().accountPrivateKey
      );

      const { sellToken, buyToken } = this.tokenService.validateTokenPair(
        params.sellTokenSymbol,
        params.buyTokenSymbol
      );

      const contractInteractor = new ContractInteractor(
        this.agent.getProvider()
      );
      const formattedAmount = BigInt(
        contractInteractor.formatTokenAmount(
          params.sellAmount.toString(),
          sellToken.decimals
        )
      );

      const quoteParams: QuoteRequest = {
        sellTokenAddress: sellToken.address,
        buyTokenAddress: buyToken.address,
        sellAmount: formattedAmount,
        takerAddress: account.address,
        size: DEFAULT_QUOTE_SIZE,
      };

      const quotes = await fetchQuotes(quoteParams);
      if (!quotes?.length) {
        throw new Error('No quotes available for this swap');
      }

      const quote = quotes[0];

      // Log route information
      if (quote.routes?.length > 0) {
        console.log('Route information:', {
          name: quote.routes[0].name,
          address: quote.routes[0].address,
          routeInfo: this.safeStringify(quote.routes[0].routeInfo),
        });
      }

      const spenderAddress = this.extractSpenderAddress(quote);

      if (!spenderAddress) {
        throw new Error(
          `Could not determine spender address from quote. Available properties: ${Object.keys(quote).join(', ')}`
        );
      }

      await this.approvalService.checkAndApproveToken(
        account,
        sellToken.address,
        spenderAddress,
        formattedAmount.toString()
      );

      const swapResult = await executeSwap(account, quote, {
        slippage: SLIPPAGE_PERCENTAGE,
      });

      const { receipt, events } = await this.monitorSwapStatus(
        swapResult.transactionHash
      );

      const tradeObject = {
        tradeId: swapResult.transactionHash,
        tradeType: 'avnuSwap',
        trade: {
          sellTokenName: params.sellTokenSymbol,
          sellTokenAddress: quote.sellTokenAddress,
          buyTokenName: params.buyTokenSymbol,
          buyTokenAddress: quote.buyTokenAddress,
          sellAmount: quote.sellAmount.toString(),
          buyAmount: quote ? quote.buyAmount.toString() : '0',
          tradePriceUSD: quote ? quote.buyTokenPriceInUsd : '0',
          explanation: params.explanation ?? '',
        },
      };

      const tradingInfoDto = {
        runtimeAgentId: getContainerId(),
        information: tradeObject,
      };

      await this.sendTradingInfo(tradingInfoDto);

      console.log('explanation :', params.explanation);

      return {
        status: 'success',
        message: `Successfully swapped ${params.sellAmount} ${params.sellTokenSymbol} for ${params.buyTokenSymbol}`,
        transactionHash: swapResult.transactionHash,
        sellAmount: params.sellAmount,
        sellToken: params.sellTokenSymbol,
        buyToken: params.buyTokenSymbol,
        receipt,
        events,
      };
    } catch (error) {
      console.error('Detailed swap error:', error);
      if (error instanceof Error) {
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      return {
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Monitors the status of a swap transaction
   * @private
   * @param {string} txHash - The transaction hash to monitor
   * @returns {Promise<{receipt: any, events: any}>} Transaction receipt and events
   */
  private async monitorSwapStatus(txHash: string) {
    const transactionMonitor = new TransactionMonitor(this.agent.getProvider());
    const receipt = await transactionMonitor.waitForTransaction(
      txHash,
      (status) => console.log('Swap status:', status)
    );
    const events = await transactionMonitor.getTransactionEvents(txHash);
    return { receipt, events };
  }

  private async sendTradingInfo(tradingInfoDto: any): Promise<void> {
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

      console.log('Trading information saved successfully');
      const data = await response.json();
      console.log('Response data:', data);
    } catch (error) {
      console.error(
        'Error saving trading information:',
        error.response?.data || error.message
      );
    }
  }
}

/**
 * Creates a new SwapService instance
 * @param {StarknetAgentInterface} agent - The Starknet agent
 * @param {string} [walletAddress] - The wallet address
 * @returns {SwapService} A new SwapService instance
 * @throws {Error} If wallet address is not provided
 */
export const createSwapService = (
  agent: StarknetAgentInterface,
  walletAddress?: string
): SwapService => {
  if (!walletAddress) {
    throw new Error('Wallet address not configured');
  }

  return new SwapService(agent, walletAddress);
};

export const swapTokens = async (
  agent: StarknetAgentInterface,
  params: SwapParams
) => {
  const accountAddress = agent.getAccountCredentials()?.accountPublicKey;

  try {
    const swapService = createSwapService(agent, accountAddress);
    const result = await swapService.executeSwapTransaction(params, agent);
    return JSON.stringify(result);
  } catch (error) {
    console.error('Detailed swap error:', error);
    if (error instanceof Error) {
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return JSON.stringify({
      status: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
