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

export const deriveFeeQuoteValue = (transaction: TransactionRow) => {
  const feeAmount = parseLocalizedNumber(transaction.gebuehr);
  const feeCurrency = transaction.waehrungGebuehr?.trim().toUpperCase();
  const quote = transaction.quote?.trim().toUpperCase();
  const asset = transaction.asset.trim().toUpperCase();

  if (feeAmount === null || feeAmount <= 0 || !feeCurrency) {
    return null;
  }

  if (quote && feeCurrency === quote) {
    return feeAmount;
  }

  if (feeCurrency !== asset) {
    return null;
  }

  const executionPrice = parseLocalizedNumber(transaction.ausfuehrungspreis);

  if (executionPrice !== null && executionPrice > 0) {
    return feeAmount * executionPrice;
  }

  const grossValue = parseLocalizedNumber(transaction.bruttoWert);
  const quantity = parseLocalizedNumber(transaction.menge);

  if (grossValue === null || quantity === null || quantity <= 0) {
    return null;
  }

  return feeAmount * (grossValue / quantity);
};

export const formatTransactionFeeDisplay = (transaction: TransactionRow) => {
  const feeAmount = parseLocalizedNumber(transaction.gebuehr);
  const feeSideDisplay =
    feeAmount !== null
      ? formatAmountWithUnit(feeAmount, transaction.waehrungGebuehr, 6)
      : transaction.gebuehr?.trim()
        ? transaction.waehrungGebuehr
          ? `${transaction.gebuehr.trim()} ${transaction.waehrungGebuehr}`
          : transaction.gebuehr.trim()
        : null;
  const feeQuoteValue = deriveFeeQuoteValue(transaction);
  const quoteSideDisplay = formatAmountWithUnit(feeQuoteValue, transaction.quote, 4);
  const parts = [feeSideDisplay, quoteSideDisplay].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" / ") : EMPTY_VALUE;
};
