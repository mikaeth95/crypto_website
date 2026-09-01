import type {
  CoinPerformanceRow,
  PortfolioAssetRow,
  PortfolioSummary,
  TransactionRow,
  WorkbookData,
} from "../types/portfolio";
import type { ImportedTransactionRecord } from "../types/supabase";

export const IMPORT_PLATFORM_OPTIONS = [
  {
    id: "crypto_com_exchange",
    label: "Crypto.com Exchange",
  },
] as const;

export type SupportedImportPlatform = (typeof IMPORT_PLATFORM_OPTIONS)[number]["id"];

export type ImportedTransactionInput = {
  source_platform: SupportedImportPlatform;
  external_id: string;
  source_file_name: string | null;
  occurred_at: string;
  transaction_type: string;
  asset: string;
  quote: string | null;
  quantity: number | null;
  execution_price: number | null;
  gross_value: number | null;
  fee: number | null;
  fee_currency: string | null;
  net_quantity: number | null;
  net_value: number | null;
  exchange: string;
  data_source: string;
  raw_payload: unknown;
};

type CryptoComExchangeCsvRow = {
  journalId: string;
  timeUtc: string;
  eventDate: string;
  journalType: string;
  instrument: string;
  takerSide: string | null;
  side: string | null;
  transactionQuantity: number | null;
  transactionCost: number | null;
  realizedPnl: number | null;
  orderId: string | null;
  tradeId: string | null;
  tradeMatchId: string | null;
  clientOrderId: string | null;
};

type PortfolioAggregateState = {
  asset: string;
  quote: string;
  quantityHeld: number;
  costBasis: number;
  totalFees: number;
  tradeCount: number;
};

const IMPORT_SOURCE_LABEL = "Imported CSV";
const CRYPTO_COM_EXCHANGE_LABEL = "Crypto.com Exchange";
const TOKEN_MIGRATION_TRANSACTION_TYPE = "Token-Umstellung";
const CSV_HEADER_PREFIX = "Journal ID,";
const FLOATING_POINT_EPSILON = 1e-9;

const quoteLikeInstruments = new Set([
  "EUR",
  "USD",
  "USDC",
  "USDT",
  "USDP",
  "DAI",
  "TUSD",
  "USDE",
]);

const roundTo = (value: number, decimals = 12): number => Number(value.toFixed(decimals));

const formatDecimal = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }

  const rounded = roundTo(value);
  const asString = rounded.toString();

  return asString.includes("e") ? rounded.toFixed(12).replace(/\.?0+$/, "") : asString;
};

const formatValueWithUnit = (
  value: number | null | undefined,
  unit: string | null | undefined,
): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }

  const formattedNumber = formatDecimal(value);

  return unit ? `${formattedNumber} (${unit})` : formattedNumber;
};

const normalizeImportedAssetCode = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed === "NULL_VAL") {
    return null;
  }

  const upperValue = trimmed.toUpperCase();

  if (upperValue === "USD_STABLE_COIN") {
    return "USD";
  }

  if (upperValue.endsWith("_STABLE_COIN")) {
    return upperValue.replace("_STABLE_COIN", "");
  }

  return trimmed;
};

const isQuoteLikeInstrument = (value: string | null | undefined): boolean => {
  const normalized = normalizeImportedAssetCode(value);

  return normalized ? quoteLikeInstruments.has(normalized.toUpperCase()) : false;
};

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value || value === "NULL_VAL") {
    return null;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const coerceNumericValue = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const parseUtcTimestamp = (value: string | null | undefined, fallbackDate?: string | null): string | null => {
  if (value) {
    const trimmed = value.trim();

    if (trimmed) {
      const isoCandidate = `${trimmed.replace(" ", "T")}Z`;
      const parsed = new Date(isoCandidate);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  if (fallbackDate) {
    const parsed = new Date(`${fallbackDate}T00:00:00.000Z`);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);

  return cells.map((cell) => cell.trim());
};

const mapCsvRows = (text: string): CryptoComExchangeCsvRow[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headerIndex = lines.findIndex((line) => line.startsWith(CSV_HEADER_PREFIX));

  if (headerIndex < 0) {
    throw new Error("The uploaded CSV does not match the Crypto.com Exchange export format.");
  }

  const headers = parseCsvLine(lines[headerIndex]);
  const requiredHeaders = [
    "Journal ID",
    "Time (UTC)",
    "Event Date",
    "Journal Type",
    "Instrument",
    "Transaction Quantity",
    "Transaction Cost",
    "Order ID",
    "Trade ID",
    "Trade Match ID",
    "Client Order Id",
  ];

  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(`The CSV is missing required columns: ${missingHeaders.join(", ")}`);
  }

  const rows = lines.slice(headerIndex + 1).map((line) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));

    return {
      journalId: row["Journal ID"],
      timeUtc: row["Time (UTC)"],
      eventDate: row["Event Date"],
      journalType: row["Journal Type"],
      instrument: row["Instrument"],
      takerSide: row["Taker Side"] && row["Taker Side"] !== "NULL_VAL" ? row["Taker Side"] : null,
      side: row["Side"] && row["Side"] !== "NULL_VAL" ? row["Side"] : null,
      transactionQuantity: parseAmount(row["Transaction Quantity"]),
      transactionCost: parseAmount(row["Transaction Cost"]),
      realizedPnl: parseAmount(row["Realized PNL"]),
      orderId: row["Order ID"] && row["Order ID"] !== "0" ? row["Order ID"] : null,
      tradeId: row["Trade ID"] && row["Trade ID"] !== "0" ? row["Trade ID"] : null,
      tradeMatchId: row["Trade Match ID"] && row["Trade Match ID"] !== "0" ? row["Trade Match ID"] : null,
      clientOrderId: row["Client Order Id"] && row["Client Order Id"] !== "0" ? row["Client Order Id"] : null,
    } satisfies CryptoComExchangeCsvRow;
  });

  return rows.filter((row) => row.journalId && row.journalType);
};

const buildTradeExternalId = (rows: CryptoComExchangeCsvRow[]): string => {
  const tradeMatchId = rows.find((row) => row.tradeMatchId)?.tradeMatchId;

  if (tradeMatchId) {
    return `crypto_com_exchange:trade:${tradeMatchId}`;
  }

  const tradeId = rows.find((row) => row.tradeId)?.tradeId;

  if (tradeId) {
    return `crypto_com_exchange:trade:${tradeId}`;
  }

  return `crypto_com_exchange:trade:${rows.map((row) => row.journalId).join("-")}`;
};

const buildConversionExternalId = (rows: CryptoComExchangeCsvRow[]): string => {
  const tradeMatchId = rows.find((row) => row.tradeMatchId)?.tradeMatchId;
  const clientOrderId = rows.find((row) => row.clientOrderId)?.clientOrderId;

  return `crypto_com_exchange:conversion:${tradeMatchId ?? clientOrderId ?? rows.map((row) => row.journalId).join("-")}`;
};

const buildTokenMigrationExternalId = (rows: CryptoComExchangeCsvRow[]): string => {
  const clientOrderId = rows.find((row) => row.clientOrderId)?.clientOrderId;

  return `crypto_com_exchange:token_migration:${clientOrderId ?? rows.map((row) => row.journalId).join("-")}`;
};

const sumFeeRows = (rows: CryptoComExchangeCsvRow[]) => {
  const feeRows = rows.filter((row) => row.journalType === "TRADE_FEE");
  const fee = feeRows.reduce((total, row) => total + Math.abs(row.transactionQuantity ?? 0), 0);
  const feeCurrencies = Array.from(
    new Set(
      feeRows
        .map((row) => normalizeImportedAssetCode(row.instrument))
        .filter((currency): currency is string => Boolean(currency)),
    ),
  );

  return {
    fee: feeRows.length > 0 ? roundTo(fee) : null,
    feeCurrency: feeCurrencies.length === 1 ? feeCurrencies[0] : null,
  };
};

const buildTradeTransaction = (
  rows: CryptoComExchangeCsvRow[],
  sourceFileName: string,
): ImportedTransactionInput | null => {
  const tradingRows = rows.filter((row) => row.journalType === "TRADING");

  if (tradingRows.length === 0) {
    return null;
  }

  const positiveRows = tradingRows.filter((row) => (row.transactionQuantity ?? 0) > 0);
  const negativeRows = tradingRows.filter((row) => (row.transactionQuantity ?? 0) < 0);
  const positiveNonQuoteRow = positiveRows.find((row) => !isQuoteLikeInstrument(row.instrument));
  const negativeNonQuoteRow = negativeRows.find((row) => !isQuoteLikeInstrument(row.instrument));

  let primaryRow: CryptoComExchangeCsvRow | undefined;
  let quoteRow: CryptoComExchangeCsvRow | undefined;
  let transactionType = "Kauf";

  if (positiveNonQuoteRow) {
    primaryRow = positiveNonQuoteRow;
    quoteRow = negativeRows.find((row) => row.instrument !== positiveNonQuoteRow.instrument) ?? negativeRows[0];
    transactionType = "Kauf";
  } else if (negativeNonQuoteRow) {
    primaryRow = negativeNonQuoteRow;
    quoteRow = positiveRows.find((row) => row.instrument !== negativeNonQuoteRow.instrument) ?? positiveRows[0];
    transactionType = "Verkauf";
  } else if (positiveRows[0] && negativeRows[0]) {
    primaryRow = positiveRows[0];
    quoteRow = negativeRows[0];
    transactionType = "Kauf";
  }

  if (!primaryRow) {
    return null;
  }

  const resolvedPrimaryRow = primaryRow;
  const asset = normalizeImportedAssetCode(resolvedPrimaryRow.instrument);
  const quote = normalizeImportedAssetCode(quoteRow?.instrument);
  const quantity = Math.abs(resolvedPrimaryRow.transactionQuantity ?? 0);
  const grossValue =
    quoteRow?.transactionQuantity !== null && quoteRow?.transactionQuantity !== undefined
      ? Math.abs(quoteRow.transactionQuantity)
      : resolvedPrimaryRow.transactionCost !== null && resolvedPrimaryRow.transactionCost !== undefined
        ? Math.abs(resolvedPrimaryRow.transactionCost)
        : null;
  const executionPrice =
    quantity > 0 && grossValue !== null ? roundTo(grossValue / quantity) : null;
  const { fee, feeCurrency } = sumFeeRows(rows);
  const normalizedFeeCurrency = normalizeImportedAssetCode(feeCurrency);
  const assetFee = normalizedFeeCurrency === asset ? fee ?? 0 : 0;
  const quoteFee = normalizedFeeCurrency === quote ? fee ?? 0 : 0;
  const netQuantity =
    transactionType === "Kauf"
      ? roundTo(Math.max(quantity - assetFee, 0))
      : roundTo(quantity + assetFee);
  const netValue =
    grossValue === null
      ? null
      : transactionType === "Kauf"
        ? roundTo(grossValue + quoteFee)
        : roundTo(Math.max(grossValue - quoteFee, 0));
  const occurredAt = parseUtcTimestamp(resolvedPrimaryRow.timeUtc, resolvedPrimaryRow.eventDate);

  if (!asset || !occurredAt) {
    return null;
  }

  return {
    source_platform: "crypto_com_exchange",
    external_id: buildTradeExternalId(rows),
    source_file_name: sourceFileName,
    occurred_at: occurredAt,
    transaction_type: transactionType,
    asset,
    quote,
    quantity: quantity > 0 ? roundTo(quantity) : null,
    execution_price: executionPrice,
    gross_value: grossValue !== null ? roundTo(grossValue) : null,
    fee,
    fee_currency: normalizedFeeCurrency,
    net_quantity: netQuantity > 0 ? netQuantity : null,
    net_value: netValue,
    exchange: CRYPTO_COM_EXCHANGE_LABEL,
    data_source: IMPORT_SOURCE_LABEL,
    raw_payload: rows,
  };
};

const buildConversionTransaction = (
  rows: CryptoComExchangeCsvRow[],
  sourceFileName: string,
): ImportedTransactionInput | null => {
  const positiveRow = rows.find((row) => (row.transactionQuantity ?? 0) > 0);
  const negativeRow = rows.find((row) => (row.transactionQuantity ?? 0) < 0);

  if (!positiveRow || !negativeRow) {
    return null;
  }

  const asset = normalizeImportedAssetCode(positiveRow.instrument);
  const quote = normalizeImportedAssetCode(negativeRow.instrument);
  const quantity = Math.abs(positiveRow.transactionQuantity ?? 0);
  const grossValue = Math.abs(negativeRow.transactionQuantity ?? 0);
  const executionPrice =
    quantity > 0 && grossValue > 0 ? roundTo(grossValue / quantity) : null;
  const occurredAt = parseUtcTimestamp(positiveRow.timeUtc, positiveRow.eventDate);

  if (!asset || !occurredAt) {
    return null;
  }

  return {
    source_platform: "crypto_com_exchange",
    external_id: buildConversionExternalId(rows),
    source_file_name: sourceFileName,
    occurred_at: occurredAt,
    transaction_type: "Konvertierung",
    asset,
    quote,
    quantity: quantity > 0 ? roundTo(quantity) : null,
    execution_price: executionPrice,
    gross_value: grossValue > 0 ? roundTo(grossValue) : null,
    fee: null,
    fee_currency: null,
    net_quantity: quantity > 0 ? roundTo(quantity) : null,
    net_value: grossValue > 0 ? roundTo(grossValue) : null,
    exchange: CRYPTO_COM_EXCHANGE_LABEL,
    data_source: IMPORT_SOURCE_LABEL,
    raw_payload: rows,
  };
};

const buildTokenMigrationTransaction = (
  rows: CryptoComExchangeCsvRow[],
  sourceFileName: string,
): ImportedTransactionInput | null => {
  const adjustmentRows = rows.filter((row) => row.journalType === "ADMIN_ADJUSTMENT");
  const positiveRow = adjustmentRows.find((row) => (row.transactionQuantity ?? 0) > 0);
  const negativeRow = adjustmentRows.find((row) => (row.transactionQuantity ?? 0) < 0);

  if (!positiveRow || !negativeRow) {
    return null;
  }

  const asset = normalizeImportedAssetCode(positiveRow.instrument);
  const previousAsset = normalizeImportedAssetCode(negativeRow.instrument);
  const quantity = Math.abs(positiveRow.transactionQuantity ?? 0);
  const previousQuantity = Math.abs(negativeRow.transactionQuantity ?? 0);
  const occurredAt = parseUtcTimestamp(positiveRow.timeUtc, positiveRow.eventDate);

  if (!asset || !previousAsset || asset === previousAsset || !occurredAt || quantity <= 0 || previousQuantity <= 0) {
    return null;
  }

  return {
    source_platform: "crypto_com_exchange",
    external_id: buildTokenMigrationExternalId(adjustmentRows),
    source_file_name: sourceFileName,
    occurred_at: occurredAt,
    transaction_type: TOKEN_MIGRATION_TRANSACTION_TYPE,
    asset,
    quote: previousAsset,
    quantity: roundTo(quantity),
    execution_price: roundTo(previousQuantity / quantity),
    gross_value: roundTo(previousQuantity),
    fee: null,
    fee_currency: null,
    net_quantity: roundTo(quantity),
    net_value: roundTo(previousQuantity),
    exchange: CRYPTO_COM_EXCHANGE_LABEL,
    data_source: IMPORT_SOURCE_LABEL,
    raw_payload: adjustmentRows,
  };
};

const mapGenericJournalType = (journalType: string): string => {
  if (journalType.includes("DEPOSIT")) {
    return "Einzahlung";
  }

  if (journalType.includes("WITHDRAW")) {
    return "Auszahlung";
  }

  return journalType.replace(/_/g, " ");
};

const buildGenericTransaction = (
  row: CryptoComExchangeCsvRow,
  sourceFileName: string,
): ImportedTransactionInput | null => {
  const asset = normalizeImportedAssetCode(row.instrument);
  const quote = isQuoteLikeInstrument(row.instrument) ? normalizeImportedAssetCode(row.instrument) : null;
  const quantity = Math.abs(row.transactionQuantity ?? 0);
  const grossValue =
    row.transactionCost !== null && row.transactionCost !== undefined
      ? Math.abs(row.transactionCost)
      : quantity;
  const occurredAt = parseUtcTimestamp(row.timeUtc, row.eventDate);

  if (!asset || !occurredAt) {
    return null;
  }

  return {
    source_platform: "crypto_com_exchange",
    external_id: `crypto_com_exchange:journal:${row.journalId}`,
    source_file_name: sourceFileName,
    occurred_at: occurredAt,
    transaction_type: mapGenericJournalType(row.journalType),
    asset,
    quote,
    quantity: quantity > 0 ? roundTo(quantity) : null,
    execution_price:
      quote && asset !== quote && quantity > 0 && grossValue > 0 ? roundTo(grossValue / quantity) : null,
    gross_value: grossValue > 0 ? roundTo(grossValue) : null,
    fee: null,
    fee_currency: null,
    net_quantity: quantity > 0 ? roundTo(quantity) : null,
    net_value: grossValue > 0 ? roundTo(grossValue) : null,
    exchange: CRYPTO_COM_EXCHANGE_LABEL,
    data_source: IMPORT_SOURCE_LABEL,
    raw_payload: row,
  };
};

export const parseCryptoComExchangeTransactions = (
  fileText: string,
  sourceFileName: string,
): ImportedTransactionInput[] => {
  const csvRows = mapCsvRows(fileText);
  const groupedRows = new Map<string, CryptoComExchangeCsvRow[]>();

  csvRows.forEach((row) => {
    const key =
      row.journalType === "STABLECOIN_CONVERSION"
        ? `conversion:${row.tradeMatchId ?? row.clientOrderId ?? row.journalId}`
        : row.journalType === "ADMIN_ADJUSTMENT" && row.clientOrderId
          ? `admin_adjustment:${row.clientOrderId}`
        : row.journalType === "TRADING" || row.journalType === "TRADE_FEE"
          ? `trade:${row.tradeMatchId ?? row.tradeId ?? row.orderId ?? row.journalId}`
          : `journal:${row.journalId}`;

    const existingRows = groupedRows.get(key) ?? [];
    existingRows.push(row);
    groupedRows.set(key, existingRows);
  });

  return Array.from(groupedRows.values())
    .flatMap((rows): ImportedTransactionInput[] => {
      const journalTypes = new Set(rows.map((row) => row.journalType));

      if (journalTypes.has("STABLECOIN_CONVERSION")) {
        const transaction = buildConversionTransaction(rows, sourceFileName);
        return transaction ? [transaction] : [];
      }

      if (journalTypes.has("ADMIN_ADJUSTMENT")) {
        const migration = buildTokenMigrationTransaction(rows, sourceFileName);

        if (migration) {
          return [migration];
        }
      }

      if (journalTypes.has("TRADING") || journalTypes.has("TRADE_FEE")) {
        const transaction = buildTradeTransaction(rows, sourceFileName);
        return transaction ? [transaction] : [];
      }

      return rows
        .map((row) => buildGenericTransaction(row, sourceFileName))
        .filter((transaction): transaction is ImportedTransactionInput => transaction !== null);
    })
    .sort(
      (left, right) =>
        new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime(),
    );
};

export const parseImportedTransactionsFromFile = (
  fileText: string,
  platform: SupportedImportPlatform,
  sourceFileName: string,
): ImportedTransactionInput[] => {
  if (platform === "crypto_com_exchange") {
    return parseCryptoComExchangeTransactions(fileText, sourceFileName);
  }

  throw new Error(`Unsupported import platform: ${platform}`);
};

const isRawPayloadRow = (value: unknown): value is Partial<CryptoComExchangeCsvRow> =>
  Boolean(value) && typeof value === "object";

const toRawPayloadRows = (rawPayload: unknown): Partial<CryptoComExchangeCsvRow>[] => {
  if (Array.isArray(rawPayload)) {
    return rawPayload.filter(isRawPayloadRow);
  }

  return isRawPayloadRow(rawPayload) ? [rawPayload] : [];
};

const normalizeLegacyTokenMigrations = (
  records: ImportedTransactionRecord[],
): ImportedTransactionRecord[] => {
  const adjustmentGroups = new Map<
    string,
    Array<{ record: ImportedTransactionRecord; row: Partial<CryptoComExchangeCsvRow> }>
  >();
  const existingExternalIds = new Set(records.map((record) => record.external_id));

  records.forEach((record) => {
    if (record.transaction_type !== "ADMIN ADJUSTMENT") {
      return;
    }

    const row = toRawPayloadRows(record.raw_payload)[0];
    const clientOrderId = row?.clientOrderId?.trim();

    if (!row || !clientOrderId) {
      return;
    }

    const group = adjustmentGroups.get(clientOrderId) ?? [];
    group.push({ record, row });
    adjustmentGroups.set(clientOrderId, group);
  });

  const consumedRecordIds = new Set<string>();
  const migrations: ImportedTransactionRecord[] = [];

  adjustmentGroups.forEach((group, clientOrderId) => {
    const positive = group.find(({ row }) => (coerceNumericValue(row.transactionQuantity) ?? 0) > 0);
    const negative = group.find(({ row }) => (coerceNumericValue(row.transactionQuantity) ?? 0) < 0);

    if (!positive || !negative) {
      return;
    }

    const asset = normalizeImportedAssetCode(positive.record.asset);
    const previousAsset = normalizeImportedAssetCode(negative.record.asset);
    const quantity = Math.abs(coerceNumericValue(positive.row.transactionQuantity) ?? 0);
    const previousQuantity = Math.abs(coerceNumericValue(negative.row.transactionQuantity) ?? 0);

    if (!asset || !previousAsset || asset === previousAsset || quantity <= 0 || previousQuantity <= 0) {
      return;
    }

    group.forEach(({ record }) => consumedRecordIds.add(record.id));

    const externalId = `crypto_com_exchange:token_migration:${clientOrderId}`;

    if (existingExternalIds.has(externalId)) {
      return;
    }

    migrations.push({
      ...positive.record,
      id: `legacy-${externalId}`,
      external_id: externalId,
      transaction_type: TOKEN_MIGRATION_TRANSACTION_TYPE,
      asset,
      quote: previousAsset,
      quantity: roundTo(quantity),
      execution_price: roundTo(previousQuantity / quantity),
      gross_value: roundTo(previousQuantity),
      fee: null,
      fee_currency: null,
      net_quantity: roundTo(quantity),
      net_value: roundTo(previousQuantity),
      raw_payload: group.map(({ row }) => row),
    });
  });

  return [...records.filter((record) => !consumedRecordIds.has(record.id)), ...migrations];
};

const firstNonEmptyString = (values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? null;

const extractTransactionIdentifiers = (rawPayload: unknown) => {
  const rows = toRawPayloadRows(rawPayload);
  const journalIds = Array.from(
    new Set(
      rows
        .map((row) => (typeof row.journalId === "string" ? row.journalId.trim() : ""))
        .filter((journalId) => journalId.length > 0),
    ),
  );

  return {
    orderId: firstNonEmptyString(rows.map((row) => row.orderId)),
    tradeId: firstNonEmptyString(rows.map((row) => row.tradeId)),
    clientOrderId: firstNonEmptyString(rows.map((row) => row.clientOrderId)),
    tradeMatchId: firstNonEmptyString(rows.map((row) => row.tradeMatchId)),
    journalIds,
  };
};

const toTransactionRow = (record: ImportedTransactionRecord): TransactionRow => ({
  ...extractTransactionIdentifiers(record.raw_payload),
  datum: record.occurred_at ? record.occurred_at.slice(0, 10) : null,
  occurredAt: record.occurred_at,
  typ: record.transaction_type,
  asset: record.asset,
  quote: record.quote,
  menge: formatDecimal(coerceNumericValue(record.quantity)),
  ausfuehrungspreis: formatValueWithUnit(coerceNumericValue(record.execution_price), record.quote),
  bruttoWert: formatValueWithUnit(coerceNumericValue(record.gross_value), record.quote),
  gebuehr: formatDecimal(coerceNumericValue(record.fee)),
  waehrungGebuehr: record.fee_currency,
  nettomenge: formatDecimal(coerceNumericValue(record.net_quantity)),
  nettowert: formatValueWithUnit(coerceNumericValue(record.net_value), record.quote),
  transaktionId: record.external_id,
  boerse: record.exchange,
  datenquelle: record.source_file_name
    ? `${record.data_source} - ${record.source_file_name}`
    : record.data_source,
});

const createEmptySummary = (): PortfolioSummary => ({
  totalPortfolioValueEUR: null,
  totalPortfolioValueUSD: null,
  totalInvestedEUR: null,
  totalInvestedUSD: null,
  totalProfitEUR: null,
  totalProfitUSD: null,
  performanceEUR: null,
  performanceUSD: null,
});

const derivePortfolioAssets = (records: ImportedTransactionRecord[]): PortfolioAssetRow[] => {
  const sortedRecords = [...records].sort(
    (left, right) => new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime(),
  );
  const aggregates = new Map<string, PortfolioAggregateState>();
  const createAggregateKey = (asset: string, quote: string) => `${asset}|${quote}`;
  const getOrCreateAggregate = (asset: string, quote: string) => {
    const key = createAggregateKey(asset, quote);
    const existingAggregate = aggregates.get(key);

    if (existingAggregate) {
      return existingAggregate;
    }

    const nextAggregate = {
      asset,
      quote,
      quantityHeld: 0,
      costBasis: 0,
      totalFees: 0,
      tradeCount: 0,
    } satisfies PortfolioAggregateState;

    aggregates.set(key, nextAggregate);

    return nextAggregate;
  };
  const addAggregateQuantity = (
    asset: string,
    quote: string,
    quantityToAdd: number,
    costBasisToAdd: number,
    tradeCountToAdd = 1,
  ) => {
    if (quantityToAdd <= FLOATING_POINT_EPSILON) {
      return;
    }

    const aggregate = getOrCreateAggregate(asset, quote);

    aggregate.quantityHeld = roundTo(aggregate.quantityHeld + quantityToAdd);
    aggregate.costBasis = roundTo(aggregate.costBasis + costBasisToAdd);
    aggregate.tradeCount += tradeCountToAdd;
  };
  const removeAggregateQuantity = (
    aggregate: PortfolioAggregateState,
    quantityToRemove: number,
    tradeCountToAdd = 1,
  ) => {
    if (quantityToRemove <= FLOATING_POINT_EPSILON || aggregate.quantityHeld <= FLOATING_POINT_EPSILON) {
      return quantityToRemove;
    }

    const quantityRemoved = Math.min(quantityToRemove, aggregate.quantityHeld);
    const averageCost =
      aggregate.quantityHeld > FLOATING_POINT_EPSILON ? aggregate.costBasis / aggregate.quantityHeld : 0;

    aggregate.quantityHeld = roundTo(Math.max(aggregate.quantityHeld - quantityRemoved, 0));
    aggregate.costBasis = roundTo(Math.max(aggregate.costBasis - averageCost * quantityRemoved, 0));
    aggregate.tradeCount += tradeCountToAdd;

    return roundTo(Math.max(quantityToRemove - quantityRemoved, 0));
  };
  const removeAcrossAssetAggregates = (asset: string, quantityToRemove: number) => {
    if (quantityToRemove <= FLOATING_POINT_EPSILON) {
      return;
    }

    let remainingQuantity = quantityToRemove;
    const matchingAggregates = Array.from(aggregates.values()).filter((aggregate) => aggregate.asset === asset);

    matchingAggregates.forEach((aggregate) => {
      if (remainingQuantity <= FLOATING_POINT_EPSILON) {
        return;
      }

      remainingQuantity = removeAggregateQuantity(aggregate, remainingQuantity, 1);
    });
  };
  const migrateAcrossAssetAggregates = (
    previousAsset: string,
    nextAsset: string,
    previousQuantity: number,
    nextQuantity: number,
  ) => {
    if (
      previousAsset === nextAsset ||
      previousQuantity <= FLOATING_POINT_EPSILON ||
      nextQuantity <= FLOATING_POINT_EPSILON
    ) {
      return;
    }

    let remainingPreviousQuantity = previousQuantity;
    const conversionRate = nextQuantity / previousQuantity;
    const matchingAggregates = Array.from(aggregates.values()).filter(
      (aggregate) => aggregate.asset === previousAsset && aggregate.quantityHeld > FLOATING_POINT_EPSILON,
    );

    matchingAggregates.forEach((aggregate) => {
      if (remainingPreviousQuantity <= FLOATING_POINT_EPSILON) {
        return;
      }

      const quantityToMigrate = Math.min(remainingPreviousQuantity, aggregate.quantityHeld);
      const averageCost = aggregate.costBasis / aggregate.quantityHeld;
      const migratedCostBasis = roundTo(averageCost * quantityToMigrate);
      const migratedTradeCount = aggregate.tradeCount;

      removeAggregateQuantity(aggregate, quantityToMigrate, 0);
      addAggregateQuantity(
        nextAsset,
        aggregate.quote,
        roundTo(quantityToMigrate * conversionRate),
        migratedCostBasis,
        migratedTradeCount,
      );
      remainingPreviousQuantity = roundTo(remainingPreviousQuantity - quantityToMigrate);
    });
  };

  sortedRecords.forEach((record) => {
    const asset = record.asset?.trim();
    const quote = record.quote?.trim();

    if (!asset) {
      return;
    }

    const quantity = Math.abs(coerceNumericValue(record.quantity) ?? 0);
    const netQuantity = Math.abs(coerceNumericValue(record.net_quantity) ?? quantity);
    const netValue = Math.abs(coerceNumericValue(record.net_value) ?? coerceNumericValue(record.gross_value) ?? 0);
    const fee = Math.abs(coerceNumericValue(record.fee) ?? 0);

    if (quote && fee > FLOATING_POINT_EPSILON) {
      const aggregate = getOrCreateAggregate(asset, quote);

      aggregate.totalFees = roundTo(aggregate.totalFees + fee);
    }

    if (record.transaction_type === "Kauf") {
      if (!quote) {
        return;
      }

      addAggregateQuantity(asset, quote, netQuantity, netValue, 1);
      removeAcrossAssetAggregates(quote, netValue);
      return;
    }

    if (record.transaction_type === "Verkauf") {
      if (!quote) {
        return;
      }

      removeAggregateQuantity(getOrCreateAggregate(asset, quote), netQuantity > 0 ? netQuantity : quantity, 1);
      addAggregateQuantity(quote, quote, netValue, netValue, 1);
      return;
    }

    if (record.transaction_type === "Konvertierung") {
      if (!quote) {
        return;
      }

      addAggregateQuantity(asset, quote, netQuantity, netValue, 1);
      removeAcrossAssetAggregates(quote, netValue);
      return;
    }

    if (record.transaction_type === TOKEN_MIGRATION_TRANSACTION_TYPE) {
      if (!quote) {
        return;
      }

      migrateAcrossAssetAggregates(quote, asset, netValue, netQuantity);
      return;
    }

    if (record.transaction_type === "Einzahlung") {
      if (!quote) {
        return;
      }

      addAggregateQuantity(asset, quote, netQuantity, netValue, 1);
      return;
    }

    if (record.transaction_type === "Auszahlung") {
      if (!quote) {
        return;
      }

      removeAggregateQuantity(getOrCreateAggregate(asset, quote), netQuantity > 0 ? netQuantity : quantity, 1);
    }
  });

  const rows = Array.from(aggregates.values())
    .filter((aggregate) => aggregate.quantityHeld > FLOATING_POINT_EPSILON)
    .sort((left, right) => left.asset.localeCompare(right.asset));
  const investedByQuote = rows.reduce<Record<string, number>>((totals, row) => {
    totals[row.quote] = roundTo((totals[row.quote] ?? 0) + row.costBasis);
    return totals;
  }, {});

  return rows.map((aggregate) => {
    const avgBuyPrice =
      aggregate.quantityHeld > FLOATING_POINT_EPSILON
        ? roundTo(aggregate.costBasis / aggregate.quantityHeld)
        : null;
    const portfolioPct =
      investedByQuote[aggregate.quote] > FLOATING_POINT_EPSILON
        ? roundTo((aggregate.costBasis / investedByQuote[aggregate.quote]) * 100)
        : null;
    const currentPrice =
      aggregate.asset.toUpperCase() === aggregate.quote.toUpperCase() ? 1 : null;
    const currentValue =
      currentPrice !== null ? roundTo(aggregate.quantityHeld * currentPrice) : null;
    const unrealizedProfit =
      currentValue !== null ? roundTo(currentValue - aggregate.costBasis) : null;
    const unrealizedProfitPct =
      currentValue !== null && aggregate.costBasis > FLOATING_POINT_EPSILON
        ? roundTo((unrealizedProfit! / aggregate.costBasis) * 100)
        : null;

    return {
      asset: aggregate.asset,
      quote: aggregate.quote,
      bestand: roundTo(aggregate.quantityHeld),
      bestandDisplay: formatDecimal(aggregate.quantityHeld),
      avgBuyPrice,
      avgBuyDisplay: formatValueWithUnit(avgBuyPrice, aggregate.quote),
      investedNet: roundTo(aggregate.costBasis),
      investedNetDisplay: formatValueWithUnit(aggregate.costBasis, aggregate.quote),
      totalFees: roundTo(aggregate.totalFees),
      totalFeesDisplay: formatValueWithUnit(aggregate.totalFees, aggregate.quote),
      currentPrice,
      currentPriceDisplay: formatValueWithUnit(currentPrice, aggregate.quote),
      currentValue,
      currentValueDisplay: formatValueWithUnit(currentValue, aggregate.quote),
      unrealizedProfit,
      unrealizedProfitDisplay: formatValueWithUnit(unrealizedProfit, aggregate.quote),
      unrealizedProfitPct,
      portfolioPct,
      trades: aggregate.tradeCount,
      ath: null,
      athDate: null,
    } satisfies PortfolioAssetRow;
  });
};

const derivePerformanceRows = (assets: PortfolioAssetRow[]): CoinPerformanceRow[] =>
  assets.map((asset) => ({
    asset: asset.asset,
    currentPrice: asset.currentPrice,
    ath: asset.ath,
    athDate: asset.athDate,
    athDrawdownPct: null,
    change1D: null,
    change7D: null,
    change30D: null,
    change90D: null,
    change1Y: null,
    high30D: null,
    low30D: null,
    range30DPct: null,
    high1Y: null,
    drawdown1YPct: null,
    vol30D: null,
    vol90D: null,
    avgBuy: asset.avgBuyPrice,
    distanceAvgPct: null,
    cmcLinkLabel: null,
    cmcUrl: null,
  }));

const deriveSummaryFromPortfolioAssets = (assets: PortfolioAssetRow[]): PortfolioSummary => {
  const summary = createEmptySummary();

  assets.forEach((asset) => {
    const quote = asset.quote?.toUpperCase();
    const investedNet = asset.investedNet ?? 0;
    const currentValue = asset.currentValue ?? 0;

    if (quote === "EUR") {
      summary.totalInvestedEUR = roundTo((summary.totalInvestedEUR ?? 0) + investedNet);
      summary.totalPortfolioValueEUR = roundTo((summary.totalPortfolioValueEUR ?? 0) + currentValue);
    }

    if (quote === "USD") {
      summary.totalInvestedUSD = roundTo((summary.totalInvestedUSD ?? 0) + investedNet);
      summary.totalPortfolioValueUSD = roundTo((summary.totalPortfolioValueUSD ?? 0) + currentValue);
    }
  });

  if (summary.totalPortfolioValueEUR !== null && summary.totalInvestedEUR !== null) {
    summary.totalProfitEUR = roundTo(summary.totalPortfolioValueEUR - summary.totalInvestedEUR);
    summary.performanceEUR =
      summary.totalInvestedEUR > FLOATING_POINT_EPSILON
        ? roundTo(summary.totalProfitEUR / summary.totalInvestedEUR)
        : null;
  }

  if (summary.totalPortfolioValueUSD !== null && summary.totalInvestedUSD !== null) {
    summary.totalProfitUSD = roundTo(summary.totalPortfolioValueUSD - summary.totalInvestedUSD);
    summary.performanceUSD =
      summary.totalInvestedUSD > FLOATING_POINT_EPSILON
        ? roundTo(summary.totalProfitUSD / summary.totalInvestedUSD)
        : null;
  }

  return summary;
};

export const buildWorkbookDataFromImportedTransactions = (
  records: ImportedTransactionRecord[],
): WorkbookData => {
  const sortedRecords = normalizeLegacyTokenMigrations(records).sort(
    (left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime(),
  );
  const transactions = sortedRecords.map(toTransactionRow);
  const assets = derivePortfolioAssets(sortedRecords);
  const performance = derivePerformanceRows(assets);
  const summary = deriveSummaryFromPortfolioAssets(assets);

  return {
    fileName: sortedRecords[0]?.source_file_name ?? "No imported transactions",
    loadedAt: sortedRecords[0]?.updated_at ?? new Date().toISOString(),
    summary,
    assets,
    transactions,
    performance,
    errors: [],
  };
};
