import { useEffect, useMemo, useState } from "react";
import { fetchHistoricalCandles } from "../lib/cryptoApi";
import type { MarketSymbol } from "../types/market";

export type MarketSparklinePoint = {
  time: number;
  value: number;
};

const SPARKLINE_CACHE_TTL_MS = 2 * 60 * 1000;

let sparklineCache = new Map<
  MarketSymbol,
  {
    points: MarketSparklinePoint[];
    fetchedAt: number;
  }
>();
let sparklineRequests = new Map<MarketSymbol, Promise<MarketSparklinePoint[]>>();

const hasFreshSparklineCache = (symbol: MarketSymbol) => {
  const cached = sparklineCache.get(symbol);

  return Boolean(cached && Date.now() - cached.fetchedAt < SPARKLINE_CACHE_TTL_MS);
};

const loadSparkline = async (symbol: MarketSymbol) => {
  if (hasFreshSparklineCache(symbol)) {
    return sparklineCache.get(symbol)?.points ?? [];
  }

  const existingRequest = sparklineRequests.get(symbol);

  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchHistoricalCandles(symbol, "1h", 24)
    .then((candles) => {
      const points = candles.map((candle) => ({
        time: candle.time,
        value: candle.close,
      }));

      sparklineCache.set(symbol, {
        points,
        fetchedAt: Date.now(),
      });

      return points;
    })
    .finally(() => {
      sparklineRequests.delete(symbol);
    });

  sparklineRequests.set(symbol, request);

  return request;
};

export const useMarketSparklineData = (symbols: MarketSymbol[]) => {
  const symbolKey = symbols.join("|");
  const uniqueSymbols = useMemo(
    () => Array.from(new Set(symbols)),
    [symbolKey],
  );
  const [sparklineData, setSparklineData] = useState<Record<string, MarketSparklinePoint[]>>({});
  const [loadingBySymbol, setLoadingBySymbol] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    if (!uniqueSymbols.length) {
      setLoadingBySymbol({});
      return;
    }

    const cachedData = uniqueSymbols.reduce<Record<string, MarketSparklinePoint[]>>((nextData, symbol) => {
      const cached = sparklineCache.get(symbol);

      if (cached) {
        nextData[symbol] = cached.points;
      }

      return nextData;
    }, {});

    if (Object.keys(cachedData).length > 0) {
      setSparklineData((currentData) => ({
        ...currentData,
        ...cachedData,
      }));
    }

    uniqueSymbols.forEach((symbol) => {
      if (hasFreshSparklineCache(symbol)) {
        return;
      }

      setLoadingBySymbol((currentState) => ({
        ...currentState,
        [symbol]: true,
      }));

      void loadSparkline(symbol)
        .then((points) => {
          if (cancelled) {
            return;
          }

          setSparklineData((currentData) => ({
            ...currentData,
            [symbol]: points,
          }));
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setSparklineData((currentData) => ({
            ...currentData,
            [symbol]: currentData[symbol] ?? [],
          }));
        })
        .finally(() => {
          if (cancelled) {
            return;
          }

          setLoadingBySymbol((currentState) => {
            const nextState = { ...currentState };

            delete nextState[symbol];

            return nextState;
          });
        });
    });

    return () => {
      cancelled = true;
    };
  }, [uniqueSymbols]);

  return {
    sparklineData,
    loadingBySymbol,
  };
};
