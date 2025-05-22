# Migrating to Paradex Live Trading

## Overview
This document outlines the technical steps required to migrate from the current simulation-based trading system to live trading on Paradex using the leftcurve plugin.

## Current Architecture
The system currently uses simulation-based trading with the following components:
- Portfolio tracking in PostgreSQL database (`sak_table_portfolio`)
- Trade simulation via the `simulate_trade` function
- Simulated trade history tracking in `paradex_trades` table
- Strategy and explanation storage in `agent_explanations` and `agent_strategies` tables

## Implementation Steps

### 1. Enable Trading Functions
Uncomment and activate the following functions in `plugins/leftcurve/src/tools/index.ts`:
```typescript
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
```

### 2. Configure Fund Management
- Activate the `deposit_to_paradex` and `withdraw_from_paradex` functions:
```typescript
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
```
- Implement secure API key management for Layerswap integration
- Add configuration for maximum deposit/withdrawal amounts

### 3. Transaction Safety Mechanisms
- Implement transaction limits in the execution functions
- Add multi-level approval system for trades above threshold values
- Create rollback procedures for failed transactions
- Add comprehensive error handling to all trading functions

### 4. Trading Logic Adaptation
- Modify the `simulate_trade` function to optionally execute real trades
- Create a bridge function to convert simulation parameters to live trading parameters
- Maintain the existing analysis mechanisms (`get_analysis_paradex`, `get_bbo`)
- Implement slippage protection for market orders

### 5. Database Synchronization
- Extend `paradex_trades` table to include a new column: `is_simulated` (boolean)
```sql
ALTER TABLE paradex_trades ADD COLUMN is_simulated BOOLEAN NOT NULL DEFAULT TRUE;
```
- Implement real-time portfolio balance synchronization with Paradex
- Add transaction status tracking and reconciliation processes

### 6. Monitoring and Alerting
- Create monitoring dashboard for live trades
- Implement alert system for:
  - Failed transactions
  - Abnormal price movements
  - Balance discrepancies
  - Deposit/withdrawal events
- Add logging middleware for all API calls

### 7. Testing Protocol
- Develop comprehensive test suite for live trading functions
- Implement sandbox testing with minimal funds
- Create A/B testing between simulation and live trading for performance comparison
- Add circuit breakers to automatically revert to simulation mode if anomalies detected

## Deployment Strategy
1. Deploy to staging environment with minimal funds
2. Conduct parallel simulation and live trading with small amounts
3. Gradually increase trading volume as confidence builds
4. Monitor performance metrics and compare with simulation results

## Required Dependencies
- Paradex API credentials (private keys and account configuration)
- Layerswap API integration
- Enhanced monitoring services
- Secure key storage solution
- Additional error handling libraries

## Risk Management
- Implement maximum exposure limits per asset
- Create automatic trading suspension triggers
- Develop daily reconciliation process between local database and Paradex balances
- Implement rate limiting to prevent excessive trading

## Feature Toggle System
Create a configuration system that allows easy switching between simulation and live trading:

```typescript
// In config.ts
export const tradingConfig = {
  liveTrading: process.env.ENABLE_LIVE_TRADING === 'true',
  maxOrderSize: process.env.MAX_ORDER_SIZE || '100', // USDC
  maxDailyVolume: process.env.MAX_DAILY_VOLUME || '1000', // USDC
  emergencyContactEmail: process.env.EMERGENCY_CONTACT || 'support@example.com',
};

// In trading functions
import { tradingConfig } from '../config';

export const executeTrade = async (params) => {
  if (tradingConfig.liveTrading) {
    // Execute live trade
    return paradexPlaceOrderMarket(params);
  } else {
    // Execute simulated trade
    return simulateTrade(params);
  }
};
```

## Conclusion
Migrating from simulated to live trading requires careful planning and implementation of several safety mechanisms. By following this guide, the transition can be made smoothly while maintaining the existing decision-making framework and portfolio management systems. 