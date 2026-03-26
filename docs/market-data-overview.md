# Market Data Overview

## Summary

This app gets market data directly from the Crypto.com Exchange public APIs in the browser. There is no backend aggregation layer for market data in the current implementation.

- REST candles: `https://api.crypto.com/exchange/v1/public/get-candlestick`
- REST tickers: `https://api.crypto.com/exchange/v1/public/get-tickers`
- WebSocket stream: `wss://stream.crypto.com/exchange/v1/market`

Source: [src/lib/cryptoApi.ts](../src/lib/cryptoApi.ts), [src/hooks/useCryptoWebSocket.ts](../src/hooks/useCryptoWebSocket.ts)

## Data Model And Normalization

The shared market types live in [src/types/market.ts](../src/types/market.ts).

- Symbols are normalized into `BASE_QUOTE` form like `BTC_EUR` or `TAO_USD`.
- Supported chart timeframes are `15m`, `1h`, `4h`, `1d`, `1w`, `1M`.
- Each timeframe maps to the Crypto.com API timeframe plus fetch and viewport defaults.

Normalization happens in [src/lib/cryptoApi.ts](../src/lib/cryptoApi.ts):

- Candle timestamps are converted to Unix seconds by `normalizeCandleTime`.
- Candle payloads are mapped into the internal `Candle` type by `normalizeCryptoComCandle`.
- Ticker payloads are mapped into `LiveMarketSummary` by `normalizeCryptoComTicker`.
- For spot tickers, `markPrice` is derived from bid/ask midpoint when possible, with `lastPrice` as fallback.

## REST Layer

The REST layer is concentrated in [src/lib/cryptoApi.ts](../src/lib/cryptoApi.ts).

### Historical candles

`fetchCandlestickBatch()` is the low-level helper used by:

- `fetchHistoricalCandles()`: fetches the latest batch for a symbol and timeframe.
- `fetchHistoricalCandlesWindow()`: fetches a bounded time window using `start_ts` and `end_ts`.

This is used to seed live charts before the socket stream catches up.

### Ticker snapshot

`fetchLiveMarketSummary()` fetches the latest ticker snapshot for a symbol. This is used as an initial snapshot and also as a fallback refresh after reconnects.

### Range summary

`fetchLiveChartRangeSummary()` fetches a REST candle window and computes:

- change %
- high
- low
- base volume
- quote volume

This means the chart stats range is not streamed directly from the socket. It is recalculated client-side from REST candles.

### ATH calculation

`fetchInstrumentAth()` calculates ATH in two steps:

1. Fetch monthly candles from the market history start date.
2. Find the month with the highest high.
3. Fetch daily candles for that month.
4. Resolve the exact ATH day from the daily candles.

This is only used in the performance flow.

## WebSocket Layer

The live stream is handled by [src/hooks/useCryptoWebSocket.ts](../src/hooks/useCryptoWebSocket.ts).

### What it does

- Opens one Crypto.com WebSocket connection for the given symbol list.
- Subscribes to candlestick channels and/or ticker channels depending on hook options.
- Responds to Crypto.com heartbeats.
- Parses both initial subscription payloads and update payloads.
- Normalizes incoming candles and tickers.
- Fans updates out to local listeners registered per symbol.
- Reconnects automatically after disconnects with a 3 second delay.

### Public API of the hook

The hook exposes:

- `subscribeToSymbol(symbol, listener)` for live candle updates
- `subscribeToMarketSummary(symbol, listener)` for live ticker updates
- `isConnected`
- `connectionLabel`
- `reconnectVersion`

`reconnectVersion` is important because consumers use it to refetch REST snapshots after the socket reconnects.

## Live Charts Flow

The live charts page creates a shared socket for the currently active preset symbols in [src/pages/LiveChartsPage.tsx](../src/pages/LiveChartsPage.tsx).

Flow:

1. `LiveChartsPage` computes `activeSymbols`.
2. It creates one `useCryptoWebSocket()` instance for those symbols.
3. Each [src/components/live-charts/LiveChartCard.tsx](../src/components/live-charts/LiveChartCard.tsx) subscribes to candle and ticker updates for its own symbol.
4. Each card also fetches REST history and a REST ticker snapshot on mount or reconnect.
5. Incoming socket candles are merged into local chart state with `mergeCandleSeries()`.
6. REST backfill batches are merged with `mergeCandleHistory()`.

### Chart initialization strategy

Each live chart card does both:

- REST bootstrap:
  - fetch latest history for the timeframe
  - optionally backfill older windows until the intended visible range is covered
- WebSocket live updates:
  - apply incremental candle updates
  - apply live ticker summary updates

This hybrid approach gives fast initial rendering plus low-latency live updates.

### Notes

- Monthly charts (`1M`) load from the configured market-history start date instead of a short recent window.
- Stats like 24H change/high/low/volume come from live ticker data for `24h`, but longer windows come from REST-derived summaries.

## Portfolio And Dashboard Flow

[src/hooks/usePortfolioLiveData.ts](../src/hooks/usePortfolioLiveData.ts) enriches workbook asset rows with live market prices.

Flow:

1. Base asset rows come from workbook data.
2. Each row is mapped to a market symbol such as `BTC_EUR`.
3. A ticker-only socket is created with `useCryptoWebSocket()`.
4. A REST ticker snapshot is fetched for each symbol.
5. Incoming live summaries overwrite current price values.
6. Derived values are recalculated in the client:
   - `currentValue`
   - `unrealizedProfit`
   - `unrealizedProfitPct`
   - `portfolioPct`

This enriched row set is used by the portfolio page and dashboard page.

## Performance Flow

[src/hooks/usePerformanceMarketData.ts](../src/hooks/usePerformanceMarketData.ts) enriches performance rows with:

- live ticker summary data
- computed ATH snapshot data

Flow:

1. Performance rows are matched with asset rows to determine quote currency.
2. A symbol like `ASSET_QUOTE` is built.
3. A ticker-only socket is created with `useCryptoWebSocket()`.
4. REST ticker snapshots are fetched per symbol.
5. REST ATH snapshots are fetched per symbol.
6. Resolved fields are computed:
   - `currentPriceResolved`
   - `change1D`
   - `athResolved`
   - `athDateResolved`
   - `athDrawdownResolved`

## Important Architecture Notes

### 1. Live charts share a socket per page view

The live charts page creates one shared socket for all active symbols, then each card subscribes to its own symbol updates.

This is efficient and avoids one socket per chart card.

### 2. Portfolio and performance each create their own socket

`usePortfolioLiveData()` and `usePerformanceMarketData()` each call `useCryptoWebSocket()` independently.

That means the app does not currently have one global market-data service or cache. Different pages can open separate ticker sockets for overlapping symbol sets.

### 3. Market data is client-side only

All market fetches and WebSocket subscriptions happen from the browser. There is no server-side persistence, rate-limit protection, or shared cache layer for market data.

### 4. Not every performance visualization is live-enriched

[src/pages/PerformancePage.tsx](../src/pages/PerformancePage.tsx) passes live-enriched rows to `PerformanceTable`, but `PerformanceCharts` still receives the raw workbook `data.performance` rows.

So the performance table is market-data-enriched, while the charts currently remain workbook-based.

## Main Files

- [src/lib/cryptoApi.ts](../src/lib/cryptoApi.ts): REST fetchers, normalization, candle merge helpers
- [src/hooks/useCryptoWebSocket.ts](../src/hooks/useCryptoWebSocket.ts): live stream connection and fan-out
- [src/components/live-charts/LiveChartCard.tsx](../src/components/live-charts/LiveChartCard.tsx): chart bootstrap plus live chart subscriptions
- [src/pages/LiveChartsPage.tsx](../src/pages/LiveChartsPage.tsx): shared live-chart socket owner
- [src/hooks/usePortfolioLiveData.ts](../src/hooks/usePortfolioLiveData.ts): portfolio live price enrichment
- [src/hooks/usePerformanceMarketData.ts](../src/hooks/usePerformanceMarketData.ts): performance live price and ATH enrichment
- [src/types/market.ts](../src/types/market.ts): market types, timeframe config, summary window config
