import {
  StarknetTool,
  StarknetAgentInterface,
} from '@starknet-agent-kit/agents';
import {
  avnuAnalysisSchema,
  cancelOrderSchema,
  depositToParadexSchema,
  getMarketDetailsSchema,
  getMarketTradingInfoSchema,
  placeOrderLimitSchema,
  placeOrderMarketSchema,
  walletSchema,
  withdrawFromParadexSchema,
} from '../schema/index.js';
import { swapSchema } from '../../../avnu//src/schema/index.js';
import { swapTokens } from '../actions/avnuActions/swap.js';
import { getAvnuLatestAnalysis } from '../actions/avnuActions/fetchAvnuLatestAnalysis.js';
import { getWalletBalances } from '../actions/avnuActions/fetchAvnuBalances.js';
import { paradexGetMarketDetails } from '../actions/paradexActions/fetchDetailedParadexMarkets.js';
import { paradexGetMarketTradingInfo } from '../actions/paradexActions/fetchBasicParadexMarkets.js';
import { paradexCancelOrder } from '../actions/paradexActions/cancelOrder.js';
import { paradexPlaceOrderMarket } from '../actions/paradexActions/placeOrderMarket.js';
import { paradexPlaceOrderLimit } from '../actions/paradexActions/placeOrderLimit.js';
import {
  getBalanceSchema,
  getBBOSchema,
  getOpenOrdersSchema,
  getOpenPositionsSchema,
  listMarketsSchema,
} from '../../../paradex/src/schema/index.js';
import { paradexGetOpenOrders } from '../../../paradex/src/actions/fetchOpenOrders.js';
import { paradexGetOpenPositions } from '../../../paradex/src/actions/fetchOpenPositions.js';
import { paradexGetBalance } from '../../../paradex/src/actions/fetchAccountBalance.js';
import { paradexGetBBO } from '../../../paradex/src/actions/getBBO.js';
// import { paradexListMarkets } from '../../../paradex/src/actions/listMarketsOnParadex.js';
import { paradexListMarkets } from '../../../paradex/src/actions/listMarketsOnParadex.js';
import { getAnalysisParadex } from '../actions/paradexActions/fetchBackendAnalysis.js';
import { depositToParadex } from '../actions/layerswapActions/depositToParadex.js';
import { withdrawFromParadex } from '../actions/layerswapActions/withdrawFromParadex.js';
import { sendParadexBalance } from '../actions/paradexActions/sendAccountBalanceToBackend.js';

export const registerTools = (
  StarknetToolRegistry: StarknetTool[],
  agent?: StarknetAgentInterface
) => {
  console.log('registering leftcurve');
  StarknetToolRegistry.push({
    name: 'get_avnu_latest_analysis',
    plugins: 'leftcurve',
    description:
      'Get the latest market analysis. Use it to deicde what is the best swap to do.',
    schema: avnuAnalysisSchema,
    execute: getAvnuLatestAnalysis,
  });

  StarknetToolRegistry.push({
    name: 'get_wallet_balances',
    plugins: 'leftcurve',
    description: 'Get all balances from starket wallet',
    schema: walletSchema,
    execute: getWalletBalances,
  });

  StarknetToolRegistry.push({
    name: 'swap_tokens',
    plugins: 'leftcurve',
    description:
      'Swap a specified amount of one token for another token, on AVNU',
    schema: swapSchema,
    execute: swapTokens,
  });

  StarknetToolRegistry.push({
    name: 'get_paradex_market_details',
    plugins: 'leftcurve',
    description:
      'Get maximum detailed information about a specific market on Paradex',
    schema: getMarketDetailsSchema,
    execute: paradexGetMarketDetails,
  });

  StarknetToolRegistry.push({
    name: 'get_paradex_market_trading_info',
    plugins: 'leftcurve',
    description:
      'Get essential trading information for one or multiple markets on Paradex',
    schema: getMarketTradingInfoSchema,
    execute: paradexGetMarketTradingInfo,
  });

  StarknetToolRegistry.push({
    name: 'place_order_limit_paradex',
    plugins: 'leftcurve',
    description:
      'Place an order limit on Paradex exchange. Base you on paradex analysis and your paradex positions to decide if you should use this action',
    schema: placeOrderLimitSchema,
    execute: paradexPlaceOrderLimit,
  });

  StarknetToolRegistry.push({
    name: 'place_order_market_paradex',
    plugins: 'leftcurve',
    description:
      'Place an order market on Paradex exchange. Base you on paradex analysis to decide if you should use this action',
    schema: placeOrderMarketSchema,
    execute: paradexPlaceOrderMarket,
  });

  StarknetToolRegistry.push({
    name: 'cancel_order_paradex',
    plugins: 'leftcurve',
    description:
      'Cancel an unexecuted order (not yet filled) on Paradex exchange without affecting the position or the asset balance',
    schema: cancelOrderSchema,
    execute: paradexCancelOrder,
  });

  StarknetToolRegistry.push({
    name: 'get_open_orders',
    plugins: 'leftcurve',
    description:
      'Get all open orders on Paradex exchange, optionally filtered by market',
    schema: getOpenOrdersSchema,
    execute: paradexGetOpenOrders,
  });

  StarknetToolRegistry.push({
    name: 'get_open_positions',
    plugins: 'leftcurve',
    description:
      'Get all open positions on Paradex exchange, optionally filtered by market',
    schema: getOpenPositionsSchema,
    execute: paradexGetOpenPositions,
  });

  StarknetToolRegistry.push({
    name: 'get_balance_on_paradex',
    plugins: 'leftcurve',
    description: 'Get account balance on Paradex exchange (USDC)',
    schema: getBalanceSchema,
    execute: paradexGetBalance,
  });

  StarknetToolRegistry.push({
    name: 'send_balance_paradex',
    plugins: 'leftcurve',
    description:
      'Always sends your Paradex balance to the backend with this function after any action on Paradex.',
    schema: getBalanceSchema,
    execute: sendParadexBalance,
  });

  StarknetToolRegistry.push({
    name: 'get_bbo',
    plugins: 'leftcurve',
    description: 'Get Best Bid/Offer data for a specified Paradex market',
    schema: getBBOSchema,
    execute: paradexGetBBO,
  });

  StarknetToolRegistry.push({
    name: 'list_markets',
    plugins: 'leftcurve',
    description: 'Get a list of all available market symbols on Paradex',
    schema: listMarketsSchema,
    execute: paradexListMarkets,
  });

  StarknetToolRegistry.push({
    name: 'get_analysis_paradex',
    plugins: 'leftcurve',
    description: 'Get the latest analysis of Paradex.',
    schema: listMarketsSchema,
    execute: getAnalysisParadex,
  });

  StarknetToolRegistry.push({
    name: 'deposit_to_paradex',
    plugins: 'leftcurve',
    description: 'Deposit USDC from Starknet to Paradex using Layerswap bridge',
    schema: depositToParadexSchema,
    execute: depositToParadex,
  });

  StarknetToolRegistry.push({
    name: 'withdraw_from_paradex',
    plugins: 'leftcurve',
    description:
      'Withdraw USDC from Paradex to Starknet using Layerswap bridge',
    schema: withdrawFromParadexSchema,
    execute: withdrawFromParadex,
  });
};
