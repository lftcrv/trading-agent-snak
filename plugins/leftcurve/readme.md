# Leftcurve Integration with Agent-Kit

This plugin allows your agent to interact with multiple trading platforms on Starknet using Agent-Kit. Leftcurve currently integrates with Paradex, AVNU, and Layerswap, enabling your agent to analyze markets, trade assets, and bridge funds between platforms.

## Available Actions
### AVNU

- get_avnu_latest_analysis: Fetch technical analysis across multiple timeframes for AVNU-supported assets.

- get_wallet_balances: Get the current Starknet wallet balances for your agent.

- swap_tokens: Execute a token swap using AVNU’s liquidity routes.

### Paradex

- get_paradex_market_details: Fetch detailed info about a specific market (funding rates, risk, oracle, limits).

- get_paradex_market_trading_info: Retrieve essential trading data (min notional, margin factors, max spread).

- place_order_market_paradex: Place a market order (buy/sell) on Paradex.

- place_order_limit_paradex: Place a limit order on Paradex with your own price and reasoning.

- cancel_order_paradex: Cancel a pending Paradex order with contextual explanation.

- get_open_orders: List open orders (optionally filtered by market).

- get_open_positions: List open positions (optionally filtered by market).

- get_balance_on_paradex: Fetch current balance on Paradex.

- send_balance_paradex: Push the latest Paradex balance to the backend for KPI tracking.

- get_bbo: Get Best Bid/Offer prices for a specific market.

- list_markets: Get a list of all tradable markets on Paradex.

- get_analysis_paradex: Fetch backend-generated analysis for selected Paradex assets.

### Layerswap

- deposit_to_paradex: Bridge USDC from Starknet to Paradex via Layerswap.

- withdraw_from_paradex: Withdraw USDC from Paradex to Starknet.