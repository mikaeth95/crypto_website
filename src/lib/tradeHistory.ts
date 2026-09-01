import type { PortfolioAssetRow, TransactionRow } from "../types/portfolio";
import { parseLocalizedNumber } from "./parsers";

const EPSILON = 1e-9;

type MutableLot = {
  id: string;
  asset: string;
  quote: string;
  buyDate: string;
  buyTimestamp: number;
  originalQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  buyPrice: number;
  buyFeePerUnit: number;
  buyTransactionId: string;
};

export type FifoMatch = {
  id: string;
  asset: string;
  quote: string;
  amount: number;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  costBasis: number;
  buyFee: number;
  grossProceeds: number;
  sellFee: number;
  netProceeds: number;
  realizedPnl: number;
  returnPct: number | null;
  holdingDays: number;
  buyTransactionId: string;
  sellTransactionId: string;
};

export type ClosedTrade = {
  id: string;
  asset: string;
  quote: string;
  sellDate: string;
  amount: number;
  averageCost: number;
  sellPrice: number;
  costBasis: number;
  grossProceeds: number;
  sellFee: number;
  netProceeds: number;
  realizedPnl: number;
  returnPct: number | null;
  averageHoldingDays: number;
  sellTransactionId: string;
  matches: FifoMatch[];
};

export type OpenLot = {
  id: string;
  asset: string;
  quote: string;
  buyDate: string;
  originalQuantity: number;
  remainingQuantity: number;
  buyPrice: number;
  costBasis: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  returnPct: number | null;
  buyTransactionId: string;
};

export type TradeHistoryResult = {
  closedTrades: ClosedTrade[];
  openLots: OpenLot[];
};

const roundTo = (value: number, decimals = 12) => Number(value.toFixed(decimals));

const parseTransactionDate = (transaction: TransactionRow) => {
  const value = transaction.occurredAt ?? transaction.datum;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;

  return {
    date: transaction.datum ?? (Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : ""),
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
  };
};

const resolveFeeInQuote = (transaction: TransactionRow, executionPrice: number) => {
  const fee = Math.abs(parseLocalizedNumber(transaction.gebuehr) ?? 0);
  const feeCurrency = transaction.waehrungGebuehr?.trim().toUpperCase();
  const asset = transaction.asset.trim().toUpperCase();
  const quote = transaction.quote?.trim().toUpperCase();

  if (fee <= EPSILON || !feeCurrency || !quote) {
    return 0;
  }

  if (feeCurrency === quote) {
    return fee;
  }

  if (feeCurrency === asset && executionPrice > EPSILON) {
    return fee * executionPrice;
  }

  return 0;
};

const createLotKey = (asset: string, quote: string) => `${asset.toUpperCase()}|${quote.toUpperCase()}`;

const pushLot = (lots: Map<string, MutableLot[]>, lot: MutableLot) => {
  const key = createLotKey(lot.asset, lot.quote);
  const existing = lots.get(key) ?? [];
  existing.push(lot);
  lots.set(key, existing);
};

const migrateLots = (
  lots: Map<string, MutableLot[]>,
  previousAsset: string,
  nextAsset: string,
  previousQuantity: number,
  nextQuantity: number,
  migrationId: string,
) => {
  if (previousQuantity <= EPSILON || nextQuantity <= EPSILON || previousAsset === nextAsset) {
    return;
  }

  let remainingPreviousQuantity = previousQuantity;
  const conversionRate = nextQuantity / previousQuantity;
  const sourceLots = Array.from(lots.values())
    .flat()
    .filter(
      (lot) => lot.asset.toUpperCase() === previousAsset.toUpperCase() && lot.remainingQuantity > EPSILON,
    )
    .sort((left, right) => left.buyTimestamp - right.buyTimestamp);

  sourceLots.forEach((lot, index) => {
    if (remainingPreviousQuantity <= EPSILON) {
      return;
    }

    const migratedQuantity = Math.min(remainingPreviousQuantity, lot.remainingQuantity);
    const nextLotQuantity = roundTo(migratedQuantity * conversionRate);
    const migratedCostBasis = roundTo(migratedQuantity * lot.unitCost);

    lot.remainingQuantity = roundTo(Math.max(lot.remainingQuantity - migratedQuantity, 0));
    remainingPreviousQuantity = roundTo(Math.max(remainingPreviousQuantity - migratedQuantity, 0));

    pushLot(lots, {
      ...lot,
      id: `${migrationId}:${index}`,
      asset: nextAsset,
      originalQuantity: nextLotQuantity,
      remainingQuantity: nextLotQuantity,
      unitCost: nextLotQuantity > EPSILON ? migratedCostBasis / nextLotQuantity : 0,
      buyFeePerUnit: lot.buyFeePerUnit / conversionRate,
    });
  });
};

export const calculateTradeHistory = (
  transactions: TransactionRow[],
  portfolioAssets: PortfolioAssetRow[] = [],
): TradeHistoryResult => {
  const lots = new Map<string, MutableLot[]>();
  const closedTrades: ClosedTrade[] = [];
  const currentAssets = new Map(
    portfolioAssets.map((asset) => [createLotKey(asset.asset, asset.quote), asset]),
  );
  const sortedTransactions = [...transactions].sort((left, right) => {
    const timeDifference = parseTransactionDate(left).timestamp - parseTransactionDate(right).timestamp;
    return timeDifference || left.transaktionId.localeCompare(right.transaktionId);
  });

  sortedTransactions.forEach((transaction) => {
    const asset = transaction.asset.trim().toUpperCase();
    const quote = transaction.quote?.trim().toUpperCase();
    const { date, timestamp } = parseTransactionDate(transaction);

    if (!asset || !quote) {
      return;
    }

    if (transaction.typ === "Kauf") {
      const quantity = Math.abs(
        parseLocalizedNumber(transaction.nettomenge) ?? parseLocalizedNumber(transaction.menge) ?? 0,
      );
      const grossValue = Math.abs(parseLocalizedNumber(transaction.bruttoWert) ?? 0);
      const executionPrice = Math.abs(
        parseLocalizedNumber(transaction.ausfuehrungspreis) ??
          (quantity > EPSILON ? grossValue / quantity : 0),
      );
      const costBasis = Math.abs(
        parseLocalizedNumber(transaction.nettowert) ??
          grossValue + resolveFeeInQuote(transaction, executionPrice),
      );
      const feeInQuote = resolveFeeInQuote(transaction, executionPrice);

      if (quantity <= EPSILON || costBasis <= EPSILON) {
        return;
      }

      pushLot(lots, {
        id: transaction.transaktionId,
        asset,
        quote,
        buyDate: date,
        buyTimestamp: timestamp,
        originalQuantity: quantity,
        remainingQuantity: quantity,
        unitCost: costBasis / quantity,
        buyPrice: executionPrice,
        buyFeePerUnit: feeInQuote / quantity,
        buyTransactionId: transaction.transaktionId,
      });
      return;
    }

    if (transaction.typ === "Token-Umstellung") {
      const nextQuantity = Math.abs(
        parseLocalizedNumber(transaction.nettomenge) ?? parseLocalizedNumber(transaction.menge) ?? 0,
      );
      const previousQuantity = Math.abs(
        parseLocalizedNumber(transaction.nettowert) ?? parseLocalizedNumber(transaction.bruttoWert) ?? 0,
      );

      migrateLots(lots, quote, asset, previousQuantity, nextQuantity, transaction.transaktionId);
      return;
    }

    if (transaction.typ !== "Verkauf") {
      return;
    }

    const quantity = Math.abs(
      parseLocalizedNumber(transaction.nettomenge) ?? parseLocalizedNumber(transaction.menge) ?? 0,
    );
    const grossProceeds = Math.abs(parseLocalizedNumber(transaction.bruttoWert) ?? 0);
    const executionPrice = Math.abs(
      parseLocalizedNumber(transaction.ausfuehrungspreis) ??
        (quantity > EPSILON ? grossProceeds / quantity : 0),
    );
    const sellFee = resolveFeeInQuote(transaction, executionPrice);
    const netProceeds = Math.abs(
      parseLocalizedNumber(transaction.nettowert) ?? Math.max(grossProceeds - sellFee, 0),
    );

    if (quantity <= EPSILON) {
      return;
    }

    let remainingQuantity = quantity;
    const matches: FifoMatch[] = [];
    const availableLots = lots.get(createLotKey(asset, quote)) ?? [];

    availableLots.forEach((lot, matchIndex) => {
      if (remainingQuantity <= EPSILON || lot.remainingQuantity <= EPSILON) {
        return;
      }

      const matchedAmount = Math.min(remainingQuantity, lot.remainingQuantity);
      const allocation = matchedAmount / quantity;
      const costBasis = roundTo(matchedAmount * lot.unitCost);
      const allocatedGrossProceeds = roundTo(grossProceeds * allocation);
      const allocatedNetProceeds = roundTo(netProceeds * allocation);
      const realizedPnl = roundTo(allocatedNetProceeds - costBasis);
      const holdingDays = Math.max(0, Math.floor((timestamp - lot.buyTimestamp) / 86_400_000));

      matches.push({
        id: `${transaction.transaktionId}:${matchIndex}`,
        asset,
        quote,
        amount: roundTo(matchedAmount),
        buyDate: lot.buyDate,
        sellDate: date,
        buyPrice: lot.buyPrice,
        sellPrice: executionPrice,
        costBasis,
        buyFee: roundTo(lot.buyFeePerUnit * matchedAmount),
        grossProceeds: allocatedGrossProceeds,
        sellFee: roundTo(sellFee * allocation),
        netProceeds: allocatedNetProceeds,
        realizedPnl,
        returnPct: costBasis > EPSILON ? roundTo((realizedPnl / costBasis) * 100) : null,
        holdingDays,
        buyTransactionId: lot.buyTransactionId,
        sellTransactionId: transaction.transaktionId,
      });

      lot.remainingQuantity = roundTo(Math.max(lot.remainingQuantity - matchedAmount, 0));
      remainingQuantity = roundTo(Math.max(remainingQuantity - matchedAmount, 0));
    });

    if (!matches.length) {
      return;
    }

    const matchedAmount = matches.reduce((total, match) => total + match.amount, 0);
    const costBasis = matches.reduce((total, match) => total + match.costBasis, 0);
    const matchedGrossProceeds = matches.reduce((total, match) => total + match.grossProceeds, 0);
    const matchedSellFee = matches.reduce((total, match) => total + match.sellFee, 0);
    const matchedNetProceeds = matches.reduce((total, match) => total + match.netProceeds, 0);
    const realizedPnl = matchedNetProceeds - costBasis;
    const weightedHoldingDays = matches.reduce(
      (total, match) => total + match.holdingDays * match.amount,
      0,
    );

    closedTrades.push({
      id: transaction.transaktionId,
      asset,
      quote,
      sellDate: date,
      amount: roundTo(matchedAmount),
      averageCost: matchedAmount > EPSILON ? roundTo(costBasis / matchedAmount) : 0,
      sellPrice: executionPrice,
      costBasis: roundTo(costBasis),
      grossProceeds: roundTo(matchedGrossProceeds),
      sellFee: roundTo(matchedSellFee),
      netProceeds: roundTo(matchedNetProceeds),
      realizedPnl: roundTo(realizedPnl),
      returnPct: costBasis > EPSILON ? roundTo((realizedPnl / costBasis) * 100) : null,
      averageHoldingDays:
        matchedAmount > EPSILON ? Math.round(weightedHoldingDays / matchedAmount) : 0,
      sellTransactionId: transaction.transaktionId,
      matches,
    });
  });

  const openLots = Array.from(lots.values())
    .flat()
    .filter((lot) => lot.remainingQuantity > EPSILON)
    .map<OpenLot>((lot) => {
      const portfolioAsset = currentAssets.get(createLotKey(lot.asset, lot.quote));
      const currentPrice = portfolioAsset?.currentPrice ?? null;
      const costBasis = roundTo(lot.remainingQuantity * lot.unitCost);
      const currentValue = currentPrice === null ? null : roundTo(lot.remainingQuantity * currentPrice);
      const unrealizedPnl = currentValue === null ? null : roundTo(currentValue - costBasis);

      return {
        id: lot.id,
        asset: lot.asset,
        quote: lot.quote,
        buyDate: lot.buyDate,
        originalQuantity: roundTo(lot.originalQuantity),
        remainingQuantity: roundTo(lot.remainingQuantity),
        buyPrice: lot.buyPrice,
        costBasis,
        currentPrice,
        currentValue,
        unrealizedPnl,
        returnPct:
          unrealizedPnl !== null && costBasis > EPSILON
            ? roundTo((unrealizedPnl / costBasis) * 100)
            : null,
        buyTransactionId: lot.buyTransactionId,
      };
    })
    .sort((left, right) => right.buyDate.localeCompare(left.buyDate));

  return {
    closedTrades: closedTrades.sort((left, right) => right.sellDate.localeCompare(left.sellDate)),
    openLots,
  };
};
