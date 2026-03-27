import type { TransactionRow } from "../../types/portfolio";
import { extractUnit, parseLocalizedNumber } from "../../lib/parsers";

export const EMPTY_VALUE = "\u2014";

const stripUnitSuffix = (value: string) => value.replace(/\s*\([^)]+\)\s*$/, "").trim();

const formatNumber = (value: number, maxFractionDigits: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });

export const transactionTone = (type: string) => {
  if (type === "Einzahlung") return "blue";
  if (type === "Kauf") return "green";
  if (type === "Verkauf") return "orange";
  if (type === "Konvertierung") return "orange";
  if (type === "Auszahlung") return "red";
  return "default";
};

export const formatAssetPair = (asset: string, quote: string | null) =>
  quote?.trim() ? `${asset} / ${quote}` : asset;

export const formatIdentifier = (value: string | null | undefined, start = 8, end = 8) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return EMPTY_VALUE;
  }

  return trimmed.length <= start + end + 3
    ? trimmed
    : `${trimmed.slice(0, start)}...${trimmed.slice(-end)}`;
};

export const formatPlainTransactionNumber = (
  value: string | null | undefined,
  maxFractionDigits = 6,
) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return EMPTY_VALUE;
  }

  const numericValue = parseLocalizedNumber(value);

  if (numericValue === null) {
    return trimmed;
  }

  return formatNumber(numericValue, maxFractionDigits);
};

export const formatInlineTransactionValue = (
  value: string | null | undefined,
  {
    raw = false,
    maxFractionDigits = 4,
  }: {
    raw?: boolean;
    maxFractionDigits?: number;
  } = {},
) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return EMPTY_VALUE;
  }

  const unit = extractUnit(trimmed);
  const rawNumber = stripUnitSuffix(trimmed);

  if (raw) {
    return unit ? `${rawNumber} ${unit}` : rawNumber;
  }

  const numericValue = parseLocalizedNumber(trimmed);

  if (numericValue === null) {
    return unit ? `${rawNumber} ${unit}` : trimmed;
  }

  const formattedNumber = formatNumber(numericValue, maxFractionDigits);

  return unit ? `${formattedNumber} ${unit}` : formattedNumber;
};

export const formatAmountWithUnit = (
  amount: number | null | undefined,
  unit: string | null | undefined,
  maxFractionDigits = 4,
) => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return null;
  }

  const formattedAmount = formatNumber(amount, maxFractionDigits);

  return unit ? `${formattedAmount} ${unit}` : formattedAmount;
};

const resolveExecutionPrice = (transaction: TransactionRow) => {
  const executionPrice = parseLocalizedNumber(transaction.ausfuehrungspreis);

  if (executionPrice !== null && executionPrice > 0) {
    return executionPrice;
  }

  const grossValue = parseLocalizedNumber(transaction.bruttoWert);
  const quantity = parseLocalizedNumber(transaction.menge);

  if (grossValue === null || quantity === null || quantity <= 0) {
    return null;
  }

  return grossValue / quantity;
};

export const deriveTransactionFeeAmounts = (transaction: TransactionRow) => {
  const feeAmount = parseLocalizedNumber(transaction.gebuehr);
  const feeCurrency = transaction.waehrungGebuehr?.trim().toUpperCase();
  const quote = transaction.quote?.trim().toUpperCase() ?? null;
  const asset = transaction.asset.trim().toUpperCase();

  if (feeAmount === null || feeAmount <= 0 || !feeCurrency) {
    return {
      assetFee: null,
      quoteFee: null,
      fallbackFeeDisplay: null,
    };
  }

  const executionPrice = resolveExecutionPrice(transaction);

  if (feeCurrency === asset) {
    return {
      assetFee: feeAmount,
      quoteFee: executionPrice !== null ? feeAmount * executionPrice : null,
      fallbackFeeDisplay: null,
    };
  }

  if (quote && feeCurrency === quote) {
    return {
      assetFee: executionPrice !== null ? feeAmount / executionPrice : null,
      quoteFee: feeAmount,
      fallbackFeeDisplay: null,
    };
  }

  return {
    assetFee: null,
    quoteFee: null,
    fallbackFeeDisplay: formatAmountWithUnit(feeAmount, transaction.waehrungGebuehr, 6),
  };
};

export const formatTransactionFeeDisplay = (transaction: TransactionRow) => {
  const rawFeeValue = transaction.gebuehr?.trim();

  if (!rawFeeValue) {
    return EMPTY_VALUE;
  }

  const { assetFee, quoteFee, fallbackFeeDisplay } = deriveTransactionFeeAmounts(transaction);
  const assetDisplay = formatAmountWithUnit(assetFee, transaction.asset, 6);
  const quoteDisplay = formatAmountWithUnit(quoteFee, transaction.quote, 4);

  if (assetDisplay || quoteDisplay) {
    return `${assetDisplay ?? EMPTY_VALUE} / ${quoteDisplay ?? EMPTY_VALUE}`;
  }

  if (fallbackFeeDisplay) {
    return fallbackFeeDisplay;
  }

  return transaction.waehrungGebuehr ? `${rawFeeValue} ${transaction.waehrungGebuehr}` : rawFeeValue;
};
