import { useEffect, useMemo, useState } from "react";
import { fetchLiveMarketSummary } from "../lib/cryptoApi";
import { useCryptoWebSocket } from "./useCryptoWebSocket";
import {
  DEFAULT_TIMEFRAME,
  normalizeMarketSymbol,
  type LiveMarketSummary,
  type MarketSymbol,
} from "../types/market";
import type { PortfolioAssetRow } from "../types/portfolio";

export type PortfolioDisplayRow = PortfolioAssetRow & {
  symbol: MarketSymbol | null;
};

export const usePortfolioLiveData = (assets: PortfolioAssetRow[]) => {
  const [liveSummaries, setLiveSummaries] = useState<Record<string, LiveMarketSummary>>({});

  const baseRows = useMemo<PortfolioDisplayRow[]>(
    () =>
      assets.map((asset) => ({
        ...asset,
        symbol:
          asset.asset.toUpperCase() === asset.quote.toUpperCase()
            ? null
            : normalizeMarketSymbol(`${asset.asset}_${asset.quote}`),
      })),
    [assets],
  );

  const symbols = useMemo(
    () =>
      Array.from(
        new Set(
          baseRows
            .map((row) => row.symbol)
            .filter((symbol): symbol is MarketSymbol => symbol !== null),
        ),
      ),
    [baseRows],
  );

  const { subscribeToMarketSummary } = useCryptoWebSocket({
    symbols,
    timeframe: DEFAULT_TIMEFRAME,
    subscribeCandlesticks: false,
    subscribeTickers: true,
  });

  useEffect(() => {
    const activeSymbols = new Set(symbols);

    setLiveSummaries((currentSummaries) =>
      Object.keys(currentSummaries).reduce<Record<string, LiveMarketSummary>>((nextSummaries, symbol) => {
        if (activeSymbols.has(symbol)) {
          nextSummaries[symbol] = currentSummaries[symbol];
        }

        return nextSummaries;
      }, {}),
    );
  }, [symbols]);

  useEffect(() => {
    const unsubscribers = symbols.map((symbol) =>
      subscribeToMarketSummary(symbol, (summary) => {
        setLiveSummaries((currentSummaries) => ({
          ...currentSummaries,
          [symbol]: summary,
        }));
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribeToMarketSummary, symbols]);

  useEffect(() => {
    let cancelled = false;

    symbols.forEach((symbol) => {
      void fetchLiveMarketSummary(symbol)
        .then((summary) => {
          if (cancelled) {
            return;
          }

          setLiveSummaries((currentSummaries) => ({
            ...currentSummaries,
            [symbol]: summary,
          }));
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const rows = useMemo(
    () => {
      const resolvedRows = baseRows.map((row) => {
        if (!row.symbol) {
          return row;
        }

        const liveSummary = liveSummaries[row.symbol];
        const currentPrice = liveSummary?.lastPrice ?? row.currentPrice;
        const currentValue =
          currentPrice !== null && row.bestand !== null ? currentPrice * row.bestand : row.currentValue;
        const unrealizedProfit =
          currentValue !== null && row.investedNet !== null ? currentValue - row.investedNet : row.unrealizedProfit;
        const unrealizedProfitPct =
          unrealizedProfit !== null && row.investedNet !== null && row.investedNet > 0
            ? (unrealizedProfit / row.investedNet) * 100
            : row.unrealizedProfitPct;

        return {
          ...row,
          currentPrice,
          currentValue,
          unrealizedProfit,
          unrealizedProfitPct,
        };
      });
      const totalsByQuote = resolvedRows.reduce<Record<string, number>>((totals, row) => {
        if (row.quote && row.currentValue !== null && row.currentValue !== undefined) {
          totals[row.quote] = (totals[row.quote] ?? 0) + row.currentValue;
        }

        return totals;
      }, {});

      return resolvedRows.map((row) => ({
        ...row,
        portfolioPct:
          row.quote && row.currentValue !== null && row.currentValue !== undefined && (totalsByQuote[row.quote] ?? 0) > 0
            ? (row.currentValue / totalsByQuote[row.quote]) * 100
            : row.portfolioPct,
      }));
    },
    [baseRows, liveSummaries],
  );

  return { rows };
};
