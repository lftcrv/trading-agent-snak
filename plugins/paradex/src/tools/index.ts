import {
  StarknetTool,
  StarknetAgentInterface,
} from '@starknet-agent-kit/agents';

import {
  cancelOrderSchema,
  getBalanceSchema,
  getBBOSchema,
  getOpenOrdersSchema,
  getOpenPositionsSchema,
  listMarketsSchema,
  placeOrderLimitSchema,
  placeOrderMarketSchema,
} from '../schema/index.js';

import { paradexCancelOrder } from '../actions/cancelOrder.js';
import { paradexGetBalance } from '../actions/fetchAccountBalance.js';
import { paradexGetOpenOrders } from '../actions/fetchOpenOrders.js';
import { paradexGetOpenPositions } from '../actions/fetchOpenPositions.js';
import { paradexGetBBO } from '../actions/getBBO.js';
import { paradexListMarkets } from '../actions/listMarketsOnParadex.js';
import { paradexPlaceOrderLimit } from '../actions/placeOrderLimit.js';
import { paradexPlaceOrderMarket } from '../actions/placeOrderMarket.js';

export const registerTools = (
  StarknetToolRegistry: StarknetTool[],
  agent?: StarknetAgentInterface
) => {
  StarknetToolRegistry.push({
    name: 'place_order_limit',
    plugins: 'paradex',
    description:
      'Place a limit order on Paradex based on analysis and positions.',
    schema: placeOrderLimitSchema,
    execute: paradexPlaceOrderLimit,
  });

  StarknetToolRegistry.push({
    name: 'place_order_market',
    plugins: 'paradex',
    description: 'Place a market order on Paradex based on your analysis.',
    schema: placeOrderMarketSchema,
    execute: paradexPlaceOrderMarket,
  });

  StarknetToolRegistry.push({
    name: 'cancel_order',
    plugins: 'paradex',
    description: 'Cancel a pending (unfilled) order on Paradex.',
    schema: cancelOrderSchema,
    execute: paradexCancelOrder,
  });

  StarknetToolRegistry.push({
    name: 'get_open_orders',
    plugins: 'paradex',
    description: 'Retrieve open orders on Paradex.',
    schema: getOpenOrdersSchema,
    execute: paradexGetOpenOrders,
  });

  StarknetToolRegistry.push({
    name: 'get_open_positions',
    plugins: 'paradex',
    description: 'Get active open positions on Paradex.',
    schema: getOpenPositionsSchema,
    execute: paradexGetOpenPositions,
  });

  StarknetToolRegistry.push({
    name: 'get_balance_on_paradex',
    plugins: 'paradex',
    description: 'Check Paradex account balance (typically USDC).',
    schema: getBalanceSchema,
    execute: paradexGetBalance,
  });

  StarknetToolRegistry.push({
    name: 'get_bbo',
    plugins: 'paradex',
    description: 'Fetch Best Bid/Offer (BBO) for a given market.',
    schema: getBBOSchema,
    execute: paradexGetBBO,
  });

  StarknetToolRegistry.push({
    name: 'list_markets',
    plugins: 'paradex',
    description: 'List all available trading pairs on Paradex.',
    schema: listMarketsSchema,
    execute: paradexListMarkets,
  });
};
