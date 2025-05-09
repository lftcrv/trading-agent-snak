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
import { noTrade } from '../actions/portfolio/noTrade.js';
import { getParadexTradeHistory } from '../actions/paradexActions/getTradeHistory.js';
import { getTradeHistorySchema, inspectTradeTableSchema, showPriceCacheSchema } from '../schema/index.js';
import { inspectParadexTradeTable } from '../actions/paradexActions/inspectTradeTable.js';
import { addAgentExplanation } from '../actions/paradexActions/addExplanation.js';
import { getAgentExplanations } from '../actions/paradexActions/getExplanations.js';
import { addExplanationSchema, getExplanationsSchema } from '../schema/index.js';
import { showPriceCache } from '../actions/portfolio/showPriceCache.js';

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

  // Create paradex_trades table to store trade history
  const tradeTableResult = await database.createTable({
    table_name: 'paradex_trades',
    if_not_exist: true,
    fields: new Map([
      ['id', 'SERIAL PRIMARY KEY'],
      ['timestamp', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
      ['market', 'VARCHAR(50) NOT NULL'],
      ['side', 'VARCHAR(10) NOT NULL'], // 'BUY' or 'SELL'
      ['size', 'NUMERIC(18,8) NOT NULL'],
      ['price', 'NUMERIC(18,8) NOT NULL'],
      ['order_type', 'VARCHAR(20) NOT NULL'], // 'LIMIT' or 'MARKET'
      ['status', 'VARCHAR(20) NOT NULL'], // 'FILLED', 'PARTIAL', 'PENDING', etc.
      ['trade_id', 'VARCHAR(100)'], // External trade ID from Paradex if available
    ]),
  });

  // Create agent_explanations table to store the agent's strategy explanations
  const explanationsTableResult = await database.createTable({
    table_name: 'agent_explanations',
    if_not_exist: true,
    fields: new Map([
      ['id', 'SERIAL PRIMARY KEY'],
      ['timestamp', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
      ['explanation', 'TEXT NOT NULL'], // Using TEXT type to store longer explanations
      ['market', 'VARCHAR(50)'], // Market that was analyzed
      ['reason', 'VARCHAR(50)'], // Specific reason for the decision
      ['price', 'NUMERIC(18,8)'], // Current price if available
      ['volume', 'NUMERIC(18,8)'], // Current volume if available
      ['volatility', 'NUMERIC(18,8)'], // Current volatility if available
      ['trend', 'VARCHAR(20)'], // Current market trend if available
      ['decision_type', 'VARCHAR(20) NOT NULL DEFAULT \'NO_TRADE\''], // Type of decision (NO_TRADE, TRADE, etc.)
    ]),
  });

  if (explanationsTableResult.status === 'error' && explanationsTableResult.code !== '42P07') {
    console.error('❌ Error creating agent_explanations table:', explanationsTableResult);
  } else {
    console.log('✅ agent_explanations table created or already exists');
  }

  if (tradeTableResult.status === 'error' && tradeTableResult.code === '42P07') {
    console.log('⚠️ Table paradex_trades already exists; attaching...');
    database.addExistingTable({
      table_name: 'paradex_trades',
      if_not_exist: false,
      fields: new Map([
        ['id', 'SERIAL PRIMARY KEY'],
        ['timestamp', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
        ['market', 'VARCHAR(50) NOT NULL'],
        ['side', 'VARCHAR(10) NOT NULL'],
        ['size', 'NUMERIC(18,8) NOT NULL'],
        ['price', 'NUMERIC(18,8) NOT NULL'],
        ['order_type', 'VARCHAR(20) NOT NULL'],
        ['status', 'VARCHAR(20) NOT NULL'],
        ['trade_id', 'VARCHAR(100)'],
      ]),
    });
  } else {
    console.log('✅ paradex_trades table created successfully');
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
      'ONLY use this if you decide trading makes sense for your character. Simulate trading one token from your portfolio for another token. This should NOT be used in every scenario - only when market conditions truly align with your personal trading philosophy. IMPORTANT: Avoid "revert trades" - never swap back to a token you recently traded out of within the last 24 hours unless there is an extremely compelling reason with significant market changes. Trading back and forth between the same tokens is usually a sign of poor strategy and will reduce profitability.',
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

  StarknetToolRegistry.push({
    name: 'get_paradex_trade_history',
    plugins: 'leftcurve',
    description: 'Retrieve the latest trades (up to 8) executed on Paradex. IMPORTANT: This tool MUST be called before each operation on Paradex to avoid revert trades and ensure you have the latest market information. CRITICAL: After reviewing your trade history, if you see that you recently swapped from Token A to Token B, you should NEVER swap back from Token B to Token A within a short timeframe unless market conditions have drastically changed (>10% price movement). Such behavior demonstrates poor trading strategy and significantly reduces profitability.',
    schema: getTradeHistorySchema,
    execute: getParadexTradeHistory,
  });

  StarknetToolRegistry.push({
    name: 'inspect_paradex_trade_table',
    plugins: 'leftcurve',
    description: 'DEBUG TOOL: Inspect the structure and content of the paradex_trades table',
    schema: inspectTradeTableSchema,
    execute: inspectParadexTradeTable,
  });

  StarknetToolRegistry.push({
    name: 'add_agent_explanation',
    plugins: 'leftcurve',
    description: 'Add an explanation of your current strategy or reasoning to the database. IMPORTANT: You MUST call this action after each trading decision (including no_trade) to maintain a history of your strategic thinking. This helps track how your strategy evolves over time and provides continuity in your decision-making process.',
    schema: addExplanationSchema,
    execute: addAgentExplanation,
  });

  StarknetToolRegistry.push({
    name: 'get_agent_explanations',
    plugins: 'leftcurve',
    description: 'Get your recent strategy explanations from the database. CRITICAL: You MUST call this action before making any trading decision to ensure you take into account your recent strategic thinking. This helps maintain consistency in your strategy and avoid contradictory decisions. Always review your past explanations before deciding on your next move.',
    schema: getExplanationsSchema,
    execute: getAgentExplanations,
  });

  StarknetToolRegistry.push({
    name: 'show_price_cache',
    plugins: 'leftcurve',
    description: 'Display the price cache used for valuation. This tool helps diagnose issues with token price lookups by showing which tokens have cached prices, their values, sources and ages.',
    schema: showPriceCacheSchema,
    execute: showPriceCache,
  });

  console.log('✅ leftcurve tools registered');
};
