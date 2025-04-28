import z from 'zod';

export const avnuAnalysisSchema = z.object({});
export const walletSchema = z.object({});

export const getMarketDetailsSchema = z.object({
  market: z
    .string()
    .describe('The market symbol to get details for, e.g., "BTC-USD-PERP"'),
});

export const getMarketTradingInfoSchema = z.object({
  markets: z
    .union([z.string(), z.array(z.string())])
    .describe(
      'Single market symbol or array of market symbols, e.g., "BTC-USD-PERP" or ["BTC-USD-PERP", "ETH-USD-PERP"]'
    ),
});

export const placeOrderLimitSchema = z.object({
  market: z.string().describe('The market for the order, e.g., "BTC-USD-PERP"'),
  side: z.string().describe('The side of the order, either "buy" or "sell"'),
  size: z
    .number()
    .positive()
    .describe('The amount of the asset to be bought or sold'),
  price: z
    .number()
    .positive()
    .describe(
      'The price at which to place the limit order (optional, for limit orders only)'
    ),
  explanation: z
    .string()
    .describe(
      'Explanation of the place order limit choice as a trader. Express yourself according to your personality, your bio, and your lore. Give deep specific details about what leads to your decision to buy that specific asset at these speficic time, according to your data, market conditions, ...'
    ),
});

export const placeOrderMarketSchema = z.object({
  market: z.string().describe('The market for the order, e.g., "BTC-USD-PERP"'),
  side: z.string().describe('The side of the order, either "buy" or "sell"'),
  size: z
    .number()
    .positive()
    .describe('The amount of the asset to be bought or sold'),
  explanation: z
    .string()
    .describe(
      'explanation of the place order market choice as a trader. Express yourself according to your personality, your bio, and your lore. Give deep specific details about what leads to your decision to buy that specific asset at these speficic time, according to your data, market conditions, ...'
    ),
});

export const cancelOrderSchema = z.object({
  orderId: z.string().describe('The ID of the order to cancel'),
  explanation: z
    .string()
    .describe(
      'explanation on why to cancel that order as a trader. Express yourself according to your personality, your bio, and your lore. Give deep specific details about what leads to your decision to buy that specific asset at these speficic time, according to your data, market conditions, ...'
    ),
});

export const depositToParadexSchema = z.object({
  amount: z
    .number()
    .positive()
    .describe('Amount of USDC to deposit from Starknet to Paradex'),
  destination_address: z
    .string()
    .describe('Paradex destination address to receive the USDC'),
  reference_id: z
    .string()
    .optional()
    .describe('Optional reference ID for tracking the transaction'),
});

export const withdrawFromParadexSchema = z.object({
  amount: z
    .number()
    .positive()
    .describe('Amount of USDC to withdraw from Paradex to Starknet'),
  destination_address: z
    .string()
    .describe('Starknet destination address to receive the USDC'),
  reference_id: z
    .string()
    .optional()
    .describe('Optional reference ID for tracking the transaction'),
});

export const simulateTradeSchema = z.object({
  fromToken: z.string().describe('The token to sell/trade from'),
  toToken: z.string().describe('The token to buy/trade to'),
  fromAmount: z
    .number()
    .positive()
    .describe('The amount of fromToken to trade'),
  explanation: z
    .string()
    .describe(
      'Detailed explanation of your trade decision as a trader. Include: 1) Why this specific trade makes sense NOW, 2) Why this is NOT reversing a recent trade (if applicable), 3) What market conditions, price movements, or new information justifies this trade, 4) How this aligns with your long-term strategy. Express yourself according to your personality, bio, and lore.'
    ),
});

export const noTradeSchema = z.object({
  explanation: z
    .string()
    .describe(
      'Explanation of why NOT trading is the right decision based on your trading style, risk tolerance, and market analysis. Include why patience is better than making questionable trades or reversing recent positions. Remember that the most successful traders often make fewer trades but with higher conviction. Express yourself according to your personality and explain why restraint is the better strategy for your character at this moment.'
    ),
});

export const getTradeHistorySchema = z.object({
  // No parameters needed
});

export const inspectTradeTableSchema = z.object({
  // No parameters needed
});
