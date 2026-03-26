import { useEffect, useState } from "react";
import { fetchLiveMarketSummaries, fetchMarketInstruments } from "../lib/cryptoApi";
import type { LiveMarketSummary, MarketInstrument } from "../types/market";

const INSTRUMENTS_CACHE_TTL_MS = 30 * 60 * 1000;
const TICKER_SUMMARIES_CACHE_TTL_MS = 2 * 60 * 1000;

let instrumentsCache: MarketInstrument[] | null = null;
let instrumentsCacheFetchedAt = 0;
let instrumentsRequest: Promise<MarketInstrument[]> | null = null;

let tickerSummariesCache: Record<string, LiveMarketSummary> | null = null;
let tickerSummariesCacheFetchedAt = 0;
let tickerSummariesRequest: Promise<Record<string, LiveMarketSummary>> | null = null;

const hasFreshInstrumentsCache = () =>
  instrumentsCache !== null && Date.now() - instrumentsCacheFetchedAt < INSTRUMENTS_CACHE_TTL_MS;

const hasFreshTickerSummariesCache = () =>
  tickerSummariesCache !== null && Date.now() - tickerSummariesCacheFetchedAt < TICKER_SUMMARIES_CACHE_TTL_MS;

const loadMarketInstruments = async () => {
  if (hasFreshInstrumentsCache() && instrumentsCache !== null) {
    return instrumentsCache;
  }

  if (instrumentsRequest) {
    return instrumentsRequest;
  }

  instrumentsRequest = fetchMarketInstruments()
    .then((nextInstruments) => {
      instrumentsCache = nextInstruments;
      instrumentsCacheFetchedAt = Date.now();

      return nextInstruments;
    })
    .finally(() => {
      instrumentsRequest = null;
    });

  return instrumentsRequest;
};

const loadTickerSummaries = async () => {
  if (hasFreshTickerSummariesCache() && tickerSummariesCache !== null) {
    return tickerSummariesCache;
  }

  if (tickerSummariesRequest) {
    return tickerSummariesRequest;
  }

  tickerSummariesRequest = fetchLiveMarketSummaries()
    .then((nextSummaries) => {
      tickerSummariesCache = nextSummaries;
      tickerSummariesCacheFetchedAt = Date.now();

      return nextSummaries;
    })
    .finally(() => {
      tickerSummariesRequest = null;
    });

  return tickerSummariesRequest;
};

export const useMarketInstruments = () => {
  const [instruments, setInstruments] = useState<MarketInstrument[]>(() => instrumentsCache ?? []);
  const [tickerSummaries, setTickerSummaries] = useState<Record<string, LiveMarketSummary>>(() => tickerSummariesCache ?? {});
  const [loading, setLoading] = useState(() => instrumentsCache === null);
  const [summariesLoading, setSummariesLoading] = useState(() => tickerSummariesCache === null);
  const [error, setError] = useState<string | null>(null);
  const [summariesError, setSummariesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (instrumentsCache !== null) {
      setInstruments(instrumentsCache);
    }

    if (tickerSummariesCache !== null) {
      setTickerSummaries(tickerSummariesCache);
    }

    setLoading(instrumentsCache === null);
    setSummariesLoading(tickerSummariesCache === null);
    setError(null);
    setSummariesError(null);

    void loadMarketInstruments()
      .then((nextInstruments) => {
        if (cancelled) {
          return;
        }

        setInstruments(nextInstruments);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return;
        }

        if (instrumentsCache === null) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load market instruments.");
          setInstruments([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    void loadTickerSummaries()
      .then((nextSummaries) => {
        if (cancelled) {
          return;
        }

        setTickerSummaries(nextSummaries);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return;
        }

        if (tickerSummariesCache === null) {
          setSummariesError(fetchError instanceof Error ? fetchError.message : "Unable to load market summaries.");
          setTickerSummaries({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSummariesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    instruments,
    tickerSummaries,
    loading,
    summariesLoading,
    error,
    summariesError,
  };
};
