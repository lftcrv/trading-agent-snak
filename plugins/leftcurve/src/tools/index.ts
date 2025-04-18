import {
  StarknetTool,
  StarknetAgentInterface,
  PostgresAdaptater,
} from '@starknet-agent-kit/agents';
import {
  avnuAnalysisSchema,
  cancelOrderSchema,
  depositToParadexSchema,
  getMarketDetailsSchema,
  getMarketTradingInfoSchema,
  noTradeSchema,
  placeOrderLimitSchema,
  placeOrderMarketSchema,
  simulateTradeSchema,
  walletSchema,
  withdrawFromParadexSchema,
} from '../schema/index.js';
import { swapSchema } from '@starknet-agent-kit/plugin-avnu/src/schema/index.js';
import { swapTokens } from '../actions/avnuActions/swap.js';
import { getAvnuLatestAnalysis } from '../actions/avnuActions/fetchAvnuLatestAnalysis.js';
import { getWalletBalances } from '../actions/avnuActions/fetchAvnuBalances.js';
import { paradexGetMarketDetails } from '../actions/paradexActions/fetchDetailedParadexMarkets.js';
import { paradexGetMarketTradingInfo } from '../actions/paradexActions/fetchBasicParadexMarkets.js';
import { paradexCancelOrder } from '../actions/paradexActions/cancelOrder.js';
import { paradexPlaceOrderMarket } from '../actions/paradexActions/placeOrderMarket.js';
import { paradexPlaceOrderLimit } from '../actions/paradexActions/placeOrderLimit.js';
// import {
//   getBalanceSchema,
//   getBBOSchema,
//   getOpenOrdersSchema,
//   getOpenPositionsSchema,
//   listMarketsSchema,
// } from '@starknet-agent-kit/plugin-paradex/dist/schema/index.js';

import {
  getBalanceSchema,
  getBBOSchema,
  getOpenOrdersSchema,
  getOpenPositionsSchema,
  listMarketsSchema,
} from '@starknet-agent-kit/plugin-paradex/dist/schema/index.js';
import { paradexGetOpenOrders } from '@starknet-agent-kit/plugin-paradex/dist/actions/fetchOpenOrders.js';
import { paradexGetOpenPositions } from '@starknet-agent-kit/plugin-paradex/dist/actions/fetchOpenPositions.js';
import { paradexGetBalance } from '@starknet-agent-kit/plugin-paradex/dist/actions/fetchAccountBalance.js';
import { paradexGetBBO } from '@starknet-agent-kit/plugin-paradex/dist/actions/getBBO.js';
// import { paradexListMarkets } from '@starknet-agent-kit/plugin-paradex/dist/actions/listMarketsOnParadex.js';
import { paradexListMarkets } from '@starknet-agent-kit/plugin-paradex/dist/actions/listMarketsOnParadex.js';
import { getAnalysisForAgent } from '../actions/paradexActions/fetchBackendAnalysis.js';
import { depositToParadex } from '../actions/layerswapActions/depositToParadex.js';
import { withdrawFromParadex } from '../actions/layerswapActions/withdrawFromParadex.js';
import { sendParadexBalance } from '../actions/paradexActions/sendParadexAccountBalanceToBackend.js';
import { simulateTrade } from '../actions/portfolio/simulateTrade.js';
import { printPortfolio } from '../actions/portfolio/printPortfolio.js';
import { sendPortfolioBalance } from '../actions/portfolio/sendPorfolioBalance.js';
import { getContainerId } from '../utils/getContainerId.js';
import { noTrade } from '@/actions/portfolio/noTrade.js';

export const initializeTools = async (
  agent: StarknetAgentInterface
): Promise<PostgresAdaptater | undefined> => {
  const containerId = getContainerId();
  const dbName = `leftcurve_db_${containerId}`;

  const database = await agent.createDatabase(dbName);
  if (!database) {
    console.error(
      `❌ Could not create or connect to leftcurve_db_${containerId}`
    );
    return;
  }

  console.log(
    `✅ Connected to leftcurve_db_${containerId} — attempting to create table`
  );

  const result = await database.createTable({
    table_name: 'sak_table_portfolio',
    if_not_exist: false,
    fields: new Map([
      ['id', 'SERIAL PRIMARY KEY'],
      ['token_symbol', 'VARCHAR(50) NOT NULL'],
      ['balance', 'NUMERIC(18,8) NOT NULL'],
    ]),
  });

  if (result.status === 'error' && result.code === '42P07') {
    console.log('⚠️ Table sak_table_portfolio already exists; attaching...');
    database.addExistingTable({
      table_name: 'sak_table_portfolio',
      if_not_exist: false,
      fields: new Map([
        ['id', 'SERIAL PRIMARY KEY'],
        ['token_symbol', 'VARCHAR(50) NOT NULL'],
        ['balance', 'NUMERIC(18,8) NOT NULL'],
      ]),
    });
  } else {
    console.log('✅ sak_table_portfolio created successfully');
  }

  // Check if the table is empty
  try {
    const countResult = await database.select({
      FROM: ['sak_table_portfolio'],
      SELECT: ['COUNT(*) as count'],
    });

    if (
      countResult.status === 'success' &&
      countResult.query &&
      countResult.query.rows.length > 0
    ) {
      const count = parseInt(countResult.query.rows[0].count);

      if (count === 0) {
        console.log('Table is empty, initializing with 1000 USDC');

        const insertResult = await database.insert({
          table_name: 'sak_table_portfolio',
          fields: new Map([
            ['token_symbol', 'USDC'],
            ['balance', '1000.00000000'],
          ]),
        });

        if (insertResult.status === 'success') {
          console.log('✅ Portfolio initialized with 1000 USDC');
        } else {
          console.error(
            '❌ Failed to initialize portfolio with USDC:',
            insertResult
          );
        }
      } else {
        console.log(`Table already has ${count} rows, skipping initialization`);
      }
    }
  } catch (error) {
    console.error('❌ Error checking table content:', error);
  }

  return database;
};

export const registerTools = async (
  StarknetToolRegistry: StarknetTool[],
  agent: StarknetAgentInterface
) => {
  console.log('registering leftcurve');

  const database_instance = await initializeTools(agent);
  if (!database_instance) {
    console.error(
      '❌ Failed to initialize leftcurve tools (database setup failed)'
    );
    return;
  }

  // StarknetToolRegistry.push({
  //   name: 'get_avnu_latest_analysis',
  //   plugins: 'leftcurve',
  //   description:
  //     'Get the latest market analysis. Use it to deicde what is the best swap to do.',
  //   schema: avnuAnalysisSchema,
  //   execute: getAvnuLatestAnalysis,
  // });

  // StarknetToolRegistry.push({
  //   name: 'get_wallet_balances',
  //   plugins: 'leftcurve',
  //   description: 'Get all balances from starket wallet',
  //   schema: walletSchema,
  //   execute: getWalletBalances,
  // });

  // StarknetToolRegistry.push({
  //   name: 'swap_tokens',
  //   plugins: 'leftcurve',
  //   description:
  //     'Swap a specified amount of one token for another token, on AVNU',
  //   schema: swapSchema,
  //   execute: swapTokens,
  // });

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

  // StarknetToolRegistry.push({
  //   name: 'place_order_limit_paradex',
  //   plugins: 'leftcurve',
  //   description:
  //     'Place an order limit on Paradex exchange. Base you on paradex analysis and your paradex positions to decide if you should use this action',
  //   schema: placeOrderLimitSchema,
  //   execute: paradexPlaceOrderLimit,
  // });

  // StarknetToolRegistry.push({
  //   name: 'place_order_market_paradex',
  //   plugins: 'leftcurve',
  //   description:
  //     'Place an order market on Paradex exchange. Base you on paradex analysis to decide if you should use this action',
  //   schema: placeOrderMarketSchema,
  //   execute: paradexPlaceOrderMarket,
  // });

  // StarknetToolRegistry.push({
  //   name: 'cancel_order_paradex',
  //   plugins: 'leftcurve',
  //   description:
  //     'Cancel an unexecuted order (not yet filled) on Paradex exchange without affecting the position or the asset balance',
  //   schema: cancelOrderSchema,
  //   execute: paradexCancelOrder,
  // });

  // StarknetToolRegistry.push({
  //   name: 'get_open_orders',
  //   plugins: 'leftcurve',
  //   description:
  //     'Get all open orders on Paradex exchange, optionally filtered by market',
  //   schema: getOpenOrdersSchema,
  //   execute: paradexGetOpenOrders,
  // });

  // StarknetToolRegistry.push({
  //   name: 'get_open_positions',
  //   plugins: 'leftcurve',
  //   description:
  //     'Get all open positions on Paradex exchange, optionally filtered by market',
  //   schema: getOpenPositionsSchema,
  //   execute: paradexGetOpenPositions,
  // });

  // StarknetToolRegistry.push({
  //   name: 'get_balance_on_paradex',
  //   plugins: 'leftcurve',
  //   description: 'Get account balance on Paradex exchange (USDC)',
  //   schema: getBalanceSchema,
  //   execute: paradexGetBalance,
  // });

  // StarknetToolRegistry.push({
  //   name: 'send_balance_paradex',
  //   plugins: 'leftcurve',
  //   description:
  //     'Always sends your Paradex balance to the backend with this function after any action on Paradex.',
  //   schema: getBalanceSchema,
  //   execute: sendParadexBalance,
  // });

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
    description:
      'Analyze Paradex markets to evaluate current conditions. Use this to determine if market conditions actually match your specific trading style and risk preferences, or if staying out of the market might be more prudent.',
    schema: listMarketsSchema,
    execute: getAnalysisForAgent,
  });

  // StarknetToolRegistry.push({
  //   name: 'deposit_to_paradex',
  //   plugins: 'leftcurve',
  //   description: 'Deposit USDC from Starknet to Paradex using Layerswap bridge',
  //   schema: depositToParadexSchema,
  //   execute: depositToParadex,
  // });

  // StarknetToolRegistry.push({
  //   name: 'withdraw_from_paradex',
  //   plugins: 'leftcurve',
  //   description:
  //     'Withdraw USDC from Paradex to Starknet using Layerswap bridge',
  //   schema: withdrawFromParadexSchema,
  //   execute: withdrawFromParadex,
  // });

  StarknetToolRegistry.push({
    name: 'get_bbo',
    plugins: 'paradex',
    description: 'Fetch Best Bid/Offer (BBO) for a given market.',
    schema: getBBOSchema,
    execute: paradexGetBBO,
  });

  StarknetToolRegistry.push({
    name: 'simulate_trade',
    plugins: 'leftcurve',
    description:
      'ONLY use this if you decide trading makes sense for your character. Simulate trading one token from your portfolio for another token. This should NOT be used in every scenario - only when market conditions truly align with your personal trading philosophy.',
    schema: simulateTradeSchema,
    execute: simulateTrade,
  });

  StarknetToolRegistry.push({
    name: 'print_portfolio',
    plugins: 'leftcurve',
    description:
      'Prints the current simulated portfolio with token balances in a nice table',
    execute: printPortfolio,
  });

  // StarknetToolRegistry.push({
  //   name: 'send_balance_paradex',
  //   plugins: 'leftcurve',
  //   description:
  //     'Always sends your Paradex balance to the backend with this function after any action on Paradex.',
  //   schema: getBalanceSchema,
  //   execute: sendParadexBalance,
  // });

  StarknetToolRegistry.push({
    name: 'send_portfolio_balance',
    plugins: 'leftcurve',
    description:
      'Always sends your total Portfolio balance to the backend with this function after any trade simulated.',
    execute: sendPortfolioBalance,
  });

  StarknetToolRegistry.push({
    name: 'no_trade',
    plugins: 'leftcurve',
    description:
      'Choose this option when you decide that NOT trading is the best decision based on your character and current market conditions. This is often the wisest choice and shows your trading discipline and patience.',
    schema: noTradeSchema,
    execute: noTrade,
  });
};
