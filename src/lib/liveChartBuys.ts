import { parseLocalizedNumber, safeDate } from "./parsers";
import { normalizeMarketSymbol, type LiveChartBuyDay, type MarketSymbol } from "../types/market";
import type { TransactionRow } from "../types/portfolio";

const toUtcDayTimestamp = (date: string): number => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);

const buildAggregateKey = (symbol: MarketSymbol, date: string) => `${symbol}|${date}`;

export const buildLiveChartBuyDaysBySymbol = (
  transactions: TransactionRow[],
): Map<MarketSymbol, LiveChartBuyDay[]> => {
  const aggregateMap = new Map<string, LiveChartBuyDay>();
  const buyDaysBySymbol = new Map<MarketSymbol, LiveChartBuyDay[]>();

  transactions.forEach((transaction) => {
    if (transaction.typ.trim().toLowerCase() !== "kauf") {
      return;
    }

    const date = safeDate(transaction.datum);
    const symbol = normalizeMarketSymbol(`${transaction.asset}_${transaction.quote ?? ""}`);

    if (!date || !symbol) {
      return;
    }

    const totalQuantity = parseLocalizedNumber(transaction.menge) ?? parseLocalizedNumber(transaction.nettomenge);
    const totalCost = parseLocalizedNumber(transaction.bruttoWert) ?? parseLocalizedNumber(transaction.nettowert);

    if (totalQuantity === null || totalQuantity <= 0 || totalCost === null || totalCost <= 0) {
      return;
    }

    const aggregateKey = buildAggregateKey(symbol, date);
    const currentAggregate = aggregateMap.get(aggregateKey);

    if (!currentAggregate) {
      aggregateMap.set(aggregateKey, {
        symbol,
        date,
        time: toUtcDayTimestamp(date),
        totalQuantity,
        totalCost,
        averagePrice: totalCost / totalQuantity,
        tradeCount: 1,
      });
      return;
    }

    currentAggregate.totalQuantity += totalQuantity;
    currentAggregate.totalCost += totalCost;
    currentAggregate.tradeCount += 1;
    currentAggregate.averagePrice =
      currentAggregate.totalQuantity > 0 ? currentAggregate.totalCost / currentAggregate.totalQuantity : currentAggregate.averagePrice;
  });

  aggregateMap.forEach((buyDay) => {
    const symbolBuyDays = buyDaysBySymbol.get(buyDay.symbol) ?? [];
    symbolBuyDays.push(buyDay);
    buyDaysBySymbol.set(buyDay.symbol, symbolBuyDays);
  });

  buyDaysBySymbol.forEach((buyDays, symbol) => {
    buyDaysBySymbol.set(
      symbol,
      buyDays.sort((left, right) => left.time - right.time),
    );
  });

  return buyDaysBySymbol;
};
