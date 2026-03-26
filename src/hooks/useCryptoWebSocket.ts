import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCandlestickChannel,
  buildTickerChannel,
  normalizeCryptoComTicker,
  normalizeCryptoComCandle,
  parseCandlestickChannelSymbol,
  parseTickerChannelSymbol,
} from "../lib/cryptoApi";
import type {
  Candle,
  ChartTimeframe,
  CryptoComCandlePayload,
  CryptoComTickerPayload,
  ConnectionLabel,
  CryptoComSocketMessage,
  LiveMarketSummary,
  MarketSummaryListener,
  MarketSummarySubscriber,
  MarketSymbol,
  SymbolListener,
  SymbolSubscriber,
} from "../types/market";
import { normalizeMarketSymbol } from "../types/market";

interface UseCryptoWebSocketOptions {
  symbols: readonly MarketSymbol[];
  timeframe: ChartTimeframe;
  subscribeCandlesticks?: boolean;
  subscribeTickers?: boolean;
}

interface UseCryptoWebSocketResult {
  isConnected: boolean;
  connectionLabel: ConnectionLabel;
  reconnectVersion: number;
  subscribeToSymbol: SymbolSubscriber;
  subscribeToMarketSummary: MarketSummarySubscriber;
}

const SOCKET_URL = "wss://stream.crypto.com/exchange/v1/market";
const RECONNECT_DELAY_MS = 3000;

type ListenerMap = Map<MarketSymbol, Set<SymbolListener>>;
type MarketSummaryListenerMap = Map<MarketSymbol, Set<MarketSummaryListener>>;

export const useCryptoWebSocket = ({
  symbols,
  timeframe,
  subscribeCandlesticks = true,
  subscribeTickers = true,
}: UseCryptoWebSocketOptions): UseCryptoWebSocketResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState<ConnectionLabel>("Connecting");
  const [reconnectVersion, setReconnectVersion] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const isMountedRef = useRef(false);
  const listenersRef = useRef<ListenerMap>(new Map());
  const marketSummaryListenersRef = useRef<MarketSummaryListenerMap>(new Map());
  const connectRef = useRef<() => void>(() => undefined);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const setConnectionState = useCallback((connected: boolean, label: ConnectionLabel) => {
    if (!isMountedRef.current) {
      return;
    }

    setIsConnected(connected);
    setConnectionLabel(label);
  }, []);

  const emitCandle = useCallback((symbol: MarketSymbol, listener: SymbolListener, candle: Candle) => {
    try {
      listener(candle);
    } catch (error) {
      console.error(`Live chart listener failed for ${symbol}.`, error);
    }
  }, []);

  const notifySymbolListeners = useCallback(
    (symbol: MarketSymbol, candle: Candle) => {
      const symbolListeners = listenersRef.current.get(symbol);

      if (!symbolListeners || symbolListeners.size === 0) {
        return;
      }

      symbolListeners.forEach((listener) => {
        emitCandle(symbol, listener, candle);
      });
    },
    [emitCandle],
  );

  const emitMarketSummary = useCallback(
    (symbol: MarketSymbol, listener: MarketSummaryListener, summary: LiveMarketSummary) => {
      try {
        listener(summary);
      } catch (error) {
        console.error(`Live market summary listener failed for ${symbol}.`, error);
      }
    },
    [],
  );

  const notifyMarketSummaryListeners = useCallback(
    (symbol: MarketSymbol, summary: LiveMarketSummary) => {
      const symbolListeners = marketSummaryListenersRef.current.get(symbol);

      if (!symbolListeners || symbolListeners.size === 0) {
        return;
      }

      symbolListeners.forEach((listener) => {
        emitMarketSummary(symbol, listener, summary);
      });
    },
    [emitMarketSummary],
  );

  const subscribeToSymbol = useCallback<SymbolSubscriber>((symbol, listener) => {
    const symbolListeners = listenersRef.current.get(symbol) ?? new Set<SymbolListener>();

    symbolListeners.add(listener);
    listenersRef.current.set(symbol, symbolListeners);

    return () => {
      const currentListeners = listenersRef.current.get(symbol);

      if (!currentListeners) {
        return;
      }

      currentListeners.delete(listener);

      if (currentListeners.size === 0) {
        listenersRef.current.delete(symbol);
      }
    };
  }, []);

  const subscribeToMarketSummary = useCallback<MarketSummarySubscriber>((symbol, listener) => {
    const symbolListeners = marketSummaryListenersRef.current.get(symbol) ?? new Set<MarketSummaryListener>();

    symbolListeners.add(listener);
    marketSummaryListenersRef.current.set(symbol, symbolListeners);

    return () => {
      const currentListeners = marketSummaryListenersRef.current.get(symbol);

      if (!currentListeners) {
        return;
      }

      currentListeners.delete(listener);

      if (currentListeners.size === 0) {
        marketSummaryListenersRef.current.delete(symbol);
      }
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current || reconnectTimerRef.current !== null) {
      return;
    }

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current();
    }, RECONNECT_DELAY_MS);
  }, []);

  const connect = useCallback(() => {
    clearReconnectTimer();

    if (!shouldReconnectRef.current) {
      return;
    }

    const existingSocket = socketRef.current;

    if (
      existingSocket &&
      (existingSocket.readyState === WebSocket.OPEN || existingSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setConnectionState(false, reconnectAttemptRef.current > 0 ? "Reconnecting" : "Connecting");

    const socket = new WebSocket(SOCKET_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      if (socketRef.current !== socket) {
        return;
      }

      const recoveredAfterReconnect = reconnectAttemptRef.current > 0;
      reconnectAttemptRef.current = 0;

      setConnectionState(true, "Connected");

      if (recoveredAfterReconnect && isMountedRef.current) {
        setReconnectVersion((current) => current + 1);
      }

      try {
        const channels = symbols.flatMap((symbol) => [
          ...(subscribeCandlesticks ? [buildCandlestickChannel(timeframe, symbol)] : []),
          ...(subscribeTickers ? [buildTickerChannel(symbol)] : []),
        ]);

        socket.send(
          JSON.stringify({
            id: Date.now(),
            method: "subscribe",
            params: {
              channels,
            },
          }),
        );
      } catch (error) {
        console.error("Failed to subscribe to Crypto.com candlestick channels.", error);
      }
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      let payload: CryptoComSocketMessage;

      try {
        payload = JSON.parse(event.data) as CryptoComSocketMessage;
      } catch {
        return;
      }

      if (payload.method === "public/heartbeat") {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              id: payload.id ?? Date.now(),
              method: "public/respond-heartbeat",
            }),
          );
        }

        return;
      }

      if (!payload.result) {
        return;
      }

      const subscriptionName =
        typeof payload.result.channel === "string"
          ? payload.result.channel
          : typeof payload.result.subscription === "string"
            ? payload.result.subscription
            : "";

      const isCandlestickUpdate =
        payload.method === "public/update-candlestick" ||
        (payload.method === "subscribe" &&
          (subscriptionName === "candlestick" || subscriptionName.startsWith("candlestick.")));
      const isTickerUpdate =
        payload.method === "public/update-ticker" ||
        (payload.method === "subscribe" &&
          (subscriptionName === "ticker" || subscriptionName.startsWith("ticker.")));

      if (isCandlestickUpdate) {
        const symbol =
          typeof payload.result.instrument_name === "string"
            ? normalizeMarketSymbol(payload.result.instrument_name)
            : typeof payload.result.channel === "string"
              ? parseCandlestickChannelSymbol(payload.result.channel)
              : null;

        if (!symbol) {
          return;
        }

        const rawCandles = Array.isArray(payload.result.data)
          ? (payload.result.data as CryptoComCandlePayload[])
          : payload.result.data
            ? [payload.result.data as CryptoComCandlePayload]
            : [];

        rawCandles.forEach((rawCandle) => {
          try {
            notifySymbolListeners(symbol, normalizeCryptoComCandle(rawCandle));
          } catch (error) {
            console.error(`Skipping malformed candle update for ${symbol}.`, error);
          }
        });

        return;
      }

      if (!isTickerUpdate) {
        return;
      }

      const symbol =
        typeof payload.result.instrument_name === "string"
          ? normalizeMarketSymbol(payload.result.instrument_name)
          : typeof payload.result.channel === "string"
            ? parseTickerChannelSymbol(payload.result.channel)
            : null;

      if (!symbol) {
        return;
      }

      const rawTickers = Array.isArray(payload.result.data)
        ? (payload.result.data as CryptoComTickerPayload[])
        : payload.result.data
          ? [payload.result.data as CryptoComTickerPayload]
          : [];

      rawTickers.forEach((rawTicker) => {
        try {
          notifyMarketSummaryListeners(symbol, normalizeCryptoComTicker(symbol, rawTicker));
        } catch (error) {
          console.error(`Skipping malformed ticker update for ${symbol}.`, error);
        }
      });
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setConnectionState(false, "Disconnected");
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      if (!shouldReconnectRef.current) {
        return;
      }

      reconnectAttemptRef.current += 1;
      setConnectionState(false, "Reconnecting");
      scheduleReconnect();
    };
  }, [
    clearReconnectTimer,
    notifySymbolListeners,
    scheduleReconnect,
    setConnectionState,
    subscribeCandlesticks,
    subscribeTickers,
    symbols,
    timeframe,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;

    setConnectionState(false, "Connecting");
    connect();

    return () => {
      shouldReconnectRef.current = false;
      isMountedRef.current = false;
      reconnectAttemptRef.current = 0;

      clearReconnectTimer();

      const socket = socketRef.current;
      socketRef.current = null;

      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
    };
  }, [clearReconnectTimer, connect, setConnectionState]);

  return {
    isConnected,
    connectionLabel,
    reconnectVersion,
    subscribeToSymbol,
    subscribeToMarketSummary,
  };
};
