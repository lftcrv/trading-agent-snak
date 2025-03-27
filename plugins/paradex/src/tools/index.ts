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
import { paradexCancelOrder } from '@/actions/cancelOrder.js';
import { paradexGetBalance } from '@/actions/fetchAccountBalance.js';
import { paradexGetOpenOrders } from '@/actions/fetchOpenOrders.js';
import { paradexGetOpenPositions } from '@/actions/fetchOpenPositions.js';
import { paradexGetBBO } from '@/actions/getBBO.js';
import { paradexListMarkets } from '@/actions/listMarketsOnParadex.js';
import { paradexPlaceOrderLimit } from '@/actions/placeOrderLimit.js';
import { paradexPlaceOrderMarket } from '@/actions/placeOrderMarket.js';

export const registerParadexTools = () => {
  StarknetToolRegistry.registerTool({
    name: 'place_order_limit',
    plugins: 'paradex',
    description:
      'Place an order limit on Paradex exchange. Base you on paradex analysis and your paradex positions to decide if you should use this action',
    schema: placeOrderLimitSchema,
    execute: paradexPlaceOrderLimit,
  });

  StarknetToolRegistry.registerTool({
    name: 'place_order_market',
    plugins: 'paradex',
    description:
      'Place an order market on Paradex exchange. Base you on paradex analysis to decide if you should use this action',
    schema: placeOrderMarketSchema,
    execute: paradexPlaceOrderMarket,
  });

  StarknetToolRegistry.registerTool({
    name: 'cancel_order',
    plugins: 'paradex',
    description:
      'Cancel an unexecuted order (not yet filled) on Paradex exchange without affecting the position or the asset balance',
    schema: cancelOrderSchema,
    execute: paradexCancelOrder,
  });

  StarknetToolRegistry.registerTool({
    name: 'get_open_orders',
    plugins: 'paradex',
    description:
      'Get all open orders on Paradex exchange, optionally filtered by market',
    schema: getOpenOrdersSchema,
    execute: paradexGetOpenOrders,
  });

  StarknetToolRegistry.registerTool({
    name: 'get_open_positions',
    plugins: 'paradex',
    description:
      'Get all open positions on Paradex exchange, optionally filtered by market',
    schema: getOpenPositionsSchema,
    execute: paradexGetOpenPositions,
  });

  StarknetToolRegistry.registerTool({
    name: 'get_balance_on_paradex',
    plugins: 'paradex',
    description: 'Get account balance on Paradex exchange (USDC)',
    schema: getBalanceSchema,
    execute: paradexGetBalance,
  });

  StarknetToolRegistry.registerTool({
    name: 'get_bbo',
    plugins: 'paradex',
    description: 'Get Best Bid/Offer data for a specified Paradex market',
    schema: getBBOSchema,
    execute: paradexGetBBO,
  });

  StarknetToolRegistry.registerTool({
    name: 'list_markets',
    plugins: 'paradex',
    description: 'Get a list of all available market symbols on Paradex',
    schema: listMarketsSchema,
    execute: paradexListMarkets,
  });
};
