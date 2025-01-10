import { Account, transaction } from "starknet";
import { executeSwap, fetchQuotes, QuoteRequest } from "@avnu/avnu-sdk";
import { tokenAddresses } from "src/lib/constant";
import { parseUnits } from "ethers";
import { rpcProvider } from "../starknetAgent";
import { symbolToDecimal } from "src/lib/utils/symbolToDecimal";

export type SwapParams = {
  sellTokenSymbol: string;
  buyTokenSymbol: string;
  sellAmount: number;
};

export const swapTokens = async (params: SwapParams, privateKey: string) => {
  try {
    const walletAddress = process.env.PUBLIC_ADDRESS;

    const account = new Account(rpcProvider, walletAddress, privateKey);

    const sellTokenAddress = tokenAddresses[params.sellTokenSymbol];

    if (!sellTokenAddress) {
      throw new Error(`Token ${params.sellTokenSymbol} not supported`);
    }

    const buyTokenAddress = tokenAddresses[params.buyTokenSymbol];

    if (!buyTokenAddress) {
      throw new Error(`Token ${params.buyTokenSymbol} not supported`);
    }

    const sellAmount = parseUnits(
      String(params.sellAmount),
      symbolToDecimal(params.sellTokenSymbol),
    );

    const quoteParams: QuoteRequest = {
      sellTokenAddress,
      buyTokenAddress,
      sellAmount,
      takerAddress: account.address,
      size: 1,
    };

    const quotes = await fetchQuotes(quoteParams);

    const result = await executeSwap(account, quotes[0], {
      slippage: 0.1,
    });

    return JSON.stringify({
      status: "success",
      message: `The swap was successful. You swapped ${params.sellAmount} ${params.sellTokenSymbol} for ${params.buyTokenSymbol}.`,
      transactionHash: result.transactionHash,
    });
  } catch (error) {
    console.log({ error });
    return JSON.stringify({
      status: "failure",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
