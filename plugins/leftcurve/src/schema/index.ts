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
      'Be concise and strategic in your trade explanation. Focus on: 1) Current market opportunity (max 2 sentences), 2) How this trade aligns with your portfolio positioning (e.g., "Increasing BTC exposure from 40% to 60% to capitalize on bullish momentum"), 3) Risk management considerations (e.g., "Maintaining 20% USDC for future opportunities"). Keep it under 100 words.'
    ),
});

export const noTradeSchema = z.object({
  explanation: z
    .string()
    .describe(
      'Be concise and strategic in your no-trade explanation. Focus on: 1) Current market conditions (max 1 sentence), 2) Your portfolio positioning (e.g., "Already well-positioned with 60% BTC, 20% ETH, 20% USDC"), 3) Why waiting is better than trading (e.g., "Waiting for better entry point as current volatility is too high"). Keep it under 75 words.'
    ),
  market: z
    .string()
    .optional()
    .describe('The market that was analyzed (e.g., "BTC-USD-PERP")'),
  reason: z
    .string()
    .optional()
    .describe('Specific reason for not trading (e.g., "UNFAVORABLE_CONDITIONS", "INSUFFICIENT_BALANCE", "HIGH_VOLATILITY", "RECENT_TRADE", etc.)'),
  analysis: z
    .object({
      price: z.number().optional().describe('Current price of the asset'),
      volume: z.number().optional().describe('Current trading volume'),
      volatility: z.number().optional().describe('Current market volatility'),
      trend: z.string().optional().describe('Current market trend (e.g., "BULLISH", "BEARISH", "SIDEWAYS")')
    })
    .optional()
    .describe('Market analysis data that influenced the decision')
});

export const getTradeHistorySchema = z.object({
  // No parameters needed
});

export const inspectTradeTableSchema = z.object({
  // No parameters needed
});

export const addExplanationSchema = z.object({
  explanation: z
    .string()
    .describe('The agent\'s explanation of its current strategy or reasoning about market conditions')
});

export const getExplanationsSchema = z.object({
  // No parameters needed for this action
});

export const showPriceCacheSchema = z.object({
  // No parameters needed
});

export const getPortfolioPnLSchema = z.object({
  // No parameters needed
});

export const initializePortfolioPnLSchema = z.object({
  // No parameters needed
});

export const resetPortfolioSchema = z.object({
  keep_usdc: z
    .boolean()
    .optional()
    .describe('Whether to keep the current USDC balance (default: false)'),
  usdc_amount: z
    .number()
    .positive()
    .optional()
    .describe('Set a specific USDC amount (default: 1000)'),
});

export const listSupportedTokensSchema = z.object({
  // No parameters needed
});

// New schemas for portfolio allocation target tracking

export const setTargetAllocationSchema = z.object({
  allocations: z.array(
    z.object({
      symbol: z.string().describe('Token symbol (e.g., DOGE, BOME, USDC)'),
      percentage: z.number().min(0).max(100).describe('Target allocation percentage (0-100)')
    })
  ).describe('Array of token allocation objects with symbol and percentage. You must only use the tokens you are assigned to trade with, plus USDC. Total must equal 100%.'),
  reasoning: z.string().optional().describe('Reasoning behind the allocation strategy update, explaining market conditions or insights that prompted the change')
});

export const getTargetAllocationSchema = z.object({
  // No parameters needed for this action
});

// Define schemas for the new strategy text management features
export const setStrategyTextSchema = z.object({
  strategy_text: z
    .string()
    .describe('The complete strategy text with bullet points describing entry and exit conditions for each of your assigned assets. Each bullet point should be a simple, clear statement. Example: "- BTC: Buy at $25K, sell at $30K"')
});

export const getStrategyTextSchema = z.object({
  // No parameters needed for this action
});
