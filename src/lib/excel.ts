/**
 * Einlesen der Excel-Arbeitsmappe (crypto_tracker.xlsx)
 *
 * Zweck:
 *   Lädt die Tracker-Arbeitsmappe per HTTP und wandelt die drei Blätter
 *   "Transaktionen", "Portfolio" und "Coin Performance" in die typisierten
 *   Datenstrukturen des Dashboards um (statische Datenquelle aus der Zeit vor
 *   bzw. neben dem Supabase-Backend; Aufruf über den Hook useWorkbookData, der
 *   aktuell nirgends eingebunden ist).
 *
 * Eingaben:
 *   - path: URL/Pfad zur .xlsx-Datei (Standard: WORKBOOK_PATH "/data/crypto_tracker.xlsx").
 *   - Blattnamen aus SHEETS; Spalten werden über feste Positionen gelesen.
 *
 * Ausgaben:
 *   WorkbookData mit Summary, Portfolio-Positionen, Transaktionen, Performance-
 *   Zeilen sowie einer Liste von Fehlermeldungen für fehlende Blätter.
 *
 * Annahmen:
 *   - Feste Spaltenreihenfolge je Blatt (keine Erkennung über Überschriften,
 *     außer der Kopfzeile "Asset" im Portfolio-Blatt).
 *   - Die Summary steht oberhalb der Tabelle im Portfolio-Blatt; Spalte B = EUR,
 *     Spalte C = USD, gefunden über Textbausteine wie "Gesamt Investiert".
 *   - Zeilen ohne Asset (bzw. ohne Datum und Asset) werden übersprungen.
 *   - Zahlen werden mit parseLocalizedNumber gelesen; für die Anzeige bleibt der
 *     Originaltext (…Display) erhalten.
 *   - Fehlende Blätter führen nicht zum Abbruch, sondern zu leeren Listen und
 *     einem Eintrag in errors; nur ein fehlgeschlagener Download wirft einen Fehler.
 *   - Felder, die es nur im Supabase-Import gibt (orderId, tradeId, journalIds …),
 *     werden leer belegt.
 */
import * as XLSX from "xlsx";
import { SHEETS } from "./constants";
import {
  parseDisplayAndNumber,
  parseLocalizedNumber,
  safeDate,
} from "./parsers";
import type {
  CoinPerformanceRow,
  PortfolioAssetRow,
  PortfolioSummary,
  TransactionRow,
  WorkbookData,
} from "../types/portfolio";

// Blatt als Array von Zeilen (Array von Zellen) mit Rohwerten; leere Zellen = "".
const toRows = (sheet: XLSX.WorkSheet) =>
  XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

// Liest den Summary-Block über Textsuche in Spalte A (erste passende Zeile gewinnt).
const parseSummary = (rows: (string | number)[][]): PortfolioSummary => {
  const find = (label: string) => rows.find((r) => String(r[0]).includes(label));
  const totalPortfolio = find("Gesamt Portfolio Wert");
  const totalInvested = find("Gesamt Investiert");
  const totalProfit = find("Gesamt Gewinn");
  const performance = find("Performance");

  return {
    totalPortfolioValueEUR: parseLocalizedNumber(totalPortfolio?.[1]),
    totalPortfolioValueUSD: parseLocalizedNumber(totalPortfolio?.[2]),
    totalInvestedEUR: parseLocalizedNumber(totalInvested?.[1]),
    totalInvestedUSD: parseLocalizedNumber(totalInvested?.[2]),
    totalProfitEUR: parseLocalizedNumber(totalProfit?.[1]),
    totalProfitUSD: parseLocalizedNumber(totalProfit?.[2]),
    performanceEUR: parseLocalizedNumber(performance?.[1]),
    performanceUSD: parseLocalizedNumber(performance?.[2]),
  };
};

// Portfolio-Blatt: Summary oben, darunter die Positionstabelle ab der Kopfzeile "Asset".
// Ohne Kopfzeile gibt es nur die Summary und keine Positionen.
const parsePortfolio = (sheet: XLSX.WorkSheet): {
  summary: PortfolioSummary;
  assets: PortfolioAssetRow[];
} => {
  const rows = toRows(sheet);
  const summary = parseSummary(rows);
  const headerIndex = rows.findIndex((r) => String(r[0]).trim() === "Asset");
  if (headerIndex < 0) return { summary, assets: [] };

  const dataRows = rows.slice(headerIndex + 1).filter((r) => String(r[0]).trim());
  const assets = dataRows.map<PortfolioAssetRow>((row) => {
    const bestand = parseDisplayAndNumber(row[2]);
    const avgBuy = parseDisplayAndNumber(row[3]);
    const invested = parseDisplayAndNumber(row[4]);
    const fees = parseDisplayAndNumber(row[5]);
    const currentPrice = parseDisplayAndNumber(row[6]);
    const currentValue = parseDisplayAndNumber(row[7]);
    const profit = parseDisplayAndNumber(row[8]);
    return {
      asset: String(row[0] ?? ""),
      quote: String(row[1] ?? ""),
      bestand: bestand.number ?? 0,
      bestandDisplay: bestand.display,
      avgBuyPrice: avgBuy.number,
      avgBuyDisplay: avgBuy.display,
      investedNet: invested.number,
      investedNetDisplay: invested.display,
      totalFees: fees.number,
      totalFeesDisplay: fees.display,
      currentPrice: currentPrice.number,
      currentPriceDisplay: currentPrice.display,
      currentValue: currentValue.number,
      currentValueDisplay: currentValue.display,
      unrealizedProfit: profit.number,
      unrealizedProfitDisplay: profit.display,
      unrealizedProfitPct: parseLocalizedNumber(row[9]),
      portfolioPct: parseLocalizedNumber(row[10]),
      trades: parseLocalizedNumber(row[11]),
      ath: parseLocalizedNumber(row[12]),
      athDate: safeDate(row[13]),
    };
  });
  return { summary, assets };
};

// Transaktionsblatt: erste Zeile ist Kopfzeile. Zahlenfelder bleiben Strings,
// weil TransactionRow sie (wie beim Supabase-Import) als Text führt.
const parseTransactions = (sheet: XLSX.WorkSheet): TransactionRow[] => {
  const rows = toRows(sheet);
  const dataRows = rows.slice(1).filter((r) => String(r[0]).trim() || String(r[2]).trim());
  return dataRows.map((row) => ({
    datum: safeDate(row[0]),
    typ: String(row[1] ?? ""),
    asset: String(row[2] ?? ""),
    quote: row[3] ? String(row[3]) : null,
    menge: String(row[4] ?? ""),
    ausfuehrungspreis: row[5] ? String(row[5]) : null,
    bruttoWert: String(row[6] ?? ""),
    gebuehr: row[7] ? String(row[7]) : null,
    waehrungGebuehr: row[8] ? String(row[8]) : null,
    nettomenge: String(row[9] ?? ""),
    nettowert: String(row[10] ?? ""),
    transaktionId: String(row[11] ?? ""),
    orderId: null,
    tradeId: null,
    clientOrderId: null,
    tradeMatchId: null,
    journalIds: [],
    boerse: String(row[12] ?? ""),
    datenquelle: String(row[13] ?? ""),
  }));
};

const parsePerformance = (sheet: XLSX.WorkSheet): CoinPerformanceRow[] => {
  const rows = toRows(sheet);
  const dataRows = rows.slice(1).filter((r) => String(r[0]).trim());

  return dataRows.map((row) => {
    // Heuristik für Zeilen ohne ATH-Datum: Ist Spalte D kein Datum, sondern eine
    // Zahl (und Spalte E leer oder klein), fehlt die Datumsspalte und alle
    // folgenden Spalten sind um eine Position nach links verschoben.
    const athDateCandidate = safeDate(row[3]);
    const shifted =
      athDateCandidate === null &&
      typeof row[3] === "number" &&
      (row[4] === "" || Math.abs(parseLocalizedNumber(row[4]) ?? 0) < 20);

    const idx = (normalIndex: number) => (shifted ? normalIndex - 1 : normalIndex);

    // CoinMarketCap-Link: Position nicht fest, daher in allen Zellen nach
    // "cmc"-Beschriftung bzw. einer http(s)-URL suchen.
    const stringCells = row.map((c) => String(c ?? "").trim()).filter(Boolean);
    const label = stringCells.find((v) => v.toLowerCase().includes("cmc")) ?? null;
    const possibleUrl = stringCells.find((v) => /^https?:\/\//i.test(v)) ?? null;

    return {
      asset: String(row[0] ?? ""),
      currentPrice: parseLocalizedNumber(row[1]),
      ath: parseLocalizedNumber(row[2]),
      athDate: shifted ? null : athDateCandidate,
      athDrawdownPct: parseLocalizedNumber(row[idx(4)]),
      change1D: parseLocalizedNumber(row[idx(5)]),
      change7D: parseLocalizedNumber(row[idx(6)]),
      change30D: parseLocalizedNumber(row[idx(7)]),
      change90D: parseLocalizedNumber(row[idx(8)]),
      change1Y: parseLocalizedNumber(row[idx(9)]),
      high30D: parseLocalizedNumber(row[idx(10)]),
      low30D: parseLocalizedNumber(row[idx(11)]),
      range30DPct: parseLocalizedNumber(row[idx(12)]),
      high1Y: parseLocalizedNumber(row[idx(13)]),
      drawdown1YPct: parseLocalizedNumber(row[idx(14)]),
      vol30D: parseLocalizedNumber(row[idx(15)]),
      vol90D: parseLocalizedNumber(row[idx(16)]),
      avgBuy: parseLocalizedNumber(row[idx(17)]),
      distanceAvgPct: parseLocalizedNumber(row[idx(18)]),
      cmcLinkLabel: label,
      cmcUrl: possibleUrl || null,
    };
  });
};

// Einstiegspunkt: Arbeitsmappe laden und alle Blätter parsen. Fehlende Blätter
// werden gesammelt statt geworfen, damit das Dashboard Teildaten anzeigen kann.
export const loadWorkbookData = async (path: string): Promise<WorkbookData> => {
  const errors: string[] = [];
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Workbook request failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const txSheet = workbook.Sheets[SHEETS.transactions];
  const portfolioSheet = workbook.Sheets[SHEETS.portfolio];
  const perfSheet = workbook.Sheets[SHEETS.performance];
  if (!txSheet) errors.push(`Missing sheet: ${SHEETS.transactions}`);
  if (!portfolioSheet) errors.push(`Missing sheet: ${SHEETS.portfolio}`);
  if (!perfSheet) errors.push(`Missing sheet: ${SHEETS.performance}`);

  const parsedPortfolio = portfolioSheet
    ? parsePortfolio(portfolioSheet)
    : { summary: emptySummary, assets: [] };

  return {
    fileName: path.split("/").pop() ?? "crypto_tracker.xlsx",
    loadedAt: new Date().toISOString(),
    summary: parsedPortfolio.summary,
    assets: parsedPortfolio.assets,
    transactions: txSheet ? parseTransactions(txSheet) : [],
    performance: perfSheet ? parsePerformance(perfSheet) : [],
    errors,
  };
};

// Platzhalter, falls das Portfolio-Blatt fehlt (wird erst zur Laufzeit von
// loadWorkbookData gelesen, daher ist die Definition nach der Funktion unkritisch).
const emptySummary: PortfolioSummary = {
  totalPortfolioValueEUR: null,
  totalPortfolioValueUSD: null,
  totalInvestedEUR: null,
  totalInvestedUSD: null,
  totalProfitEUR: null,
  totalProfitUSD: null,
  performanceEUR: null,
  performanceUSD: null,
};
