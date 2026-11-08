/**
 * Kennzahlen für das Dashboard
 *
 * Zweck:
 *   Verdichtet die Portfolio-Positionen zu den Übersichtskennzahlen des
 *   Dashboards: Portfoliowert, investiertes Kapital, Gewinn/Verlust und
 *   Performance – jeweils getrennt nach Quote-Währung (EUR, USD) und, sofern ein
 *   Wechselkurs ableitbar ist, kombiniert in EUR bzw. USD. Zusätzlich einfache
 *   Zählwerte (Anzahl Positionen, Gewinner/Verlierer, größte Position) und ein
 *   Nachschlage-Index pro Asset.
 *
 * Eingaben:
 *   - PortfolioAssetRow[]: eine Zeile pro Asset/Quote-Paar mit Bestand,
 *     Durchschnittskaufpreis, investiertem Nettobetrag, aktuellem Kurs/Wert.
 *   - CoinPerformanceRow[] und TransactionRow[] (nur für byAssetLookup bzw.
 *     dashboardDerived).
 *
 * Ausgaben:
 *   - deriveDashboardSummary: DashboardSummary (Beträge je Quote und kombiniert,
 *     Performance als Anteil, z. B. 0.12 = 12 %; die Anzeige multipliziert mit 100).
 *   - derivePortfolioSummary: PortfolioSummary (einfachere Variante, s. u.).
 *   - dashboardDerived, byAssetLookup: Hilfsstrukturen für Karten/Tabellen.
 *
 * Annahmen:
 *   - Nur Positionen mit Quote EUR oder USD fließen in die Summen ein; andere
 *     Quotes (z. B. USDT, BTC) werden ignoriert.
 *   - Fiat und Stablecoins (DASHBOARD_FIAT_ASSETS) zählen zum Portfoliowert,
 *     aber nicht zu "investiert" und "Gewinn", weil Bargeld keine Investition ist.
 *   - Der EUR/USD-Kurs wird aus einer USD|EUR- oder EUR|USD-Position im Portfolio
 *     abgeleitet. Gibt es keine, enthalten die "combined"-Werte nur den Anteil der
 *     jeweils eigenen Quote (keine Umrechnung).
 *   - Fehlt ein aktueller Wert, wird ersatzweise Kurs × Bestand oder
 *     Durchschnittskaufpreis × Bestand verwendet.
 *   - Rundung nur auf 12 Nachkommastellen gegen Gleitkomma-Reste; nicht endliche
 *     Werte werden zu null.
 */
import type {
  CoinPerformanceRow,
  PortfolioAssetRow,
  PortfolioSummary,
  TransactionRow,
} from "../types/portfolio";

// Assets, die als Bargeld/Stablecoin gelten und nicht als Investition zählen.
const DASHBOARD_FIAT_ASSETS = new Set(["EUR", "USD", "USDC", "USDT", "USDP", "DAI", "TUSD", "USDE"]);
const DASHBOARD_FLOAT_EPSILON = 1e-9;

// Ein Betrag in vier Sichten: je Quote (nur EUR- bzw. nur USD-Positionen) und
// kombiniert (alle Positionen umgerechnet in EUR bzw. USD).
export type DashboardMetricSummary = {
  combinedEUR: number | null;
  combinedUSD: number | null;
  quoteEUR: number | null;
  quoteUSD: number | null;
};

export type DashboardSummary = {
  portfolio: DashboardMetricSummary;
  invested: DashboardMetricSummary;
  profit: DashboardMetricSummary;
  performance: {
    combined: number | null;
    eur: number | null;
    usd: number | null;
  };
};

const roundTo = (value: number, decimals = 12): number => Number(value.toFixed(decimals));

const coalesceMetricValue = (value: number): number | null =>
  Number.isFinite(value) ? roundTo(value) : null;

const isFiatAsset = (asset: PortfolioAssetRow) => DASHBOARD_FIAT_ASSETS.has(asset.asset.toUpperCase());

// Ermittelt den aktuellen Wert einer Position mit absteigender Verlässlichkeit:
// gelieferter Wert -> Bestand (wenn Asset = Quote, z. B. EUR-Guthaben) ->
// Kurs × Bestand -> Durchschnittskaufpreis × Bestand (Notlösung ohne Marktkurs).
const resolveAssetCurrentValue = (asset: PortfolioAssetRow): number | null => {
  if (asset.currentValue !== null && asset.currentValue !== undefined && Number.isFinite(asset.currentValue)) {
    return asset.currentValue;
  }

  if (asset.asset.toUpperCase() === asset.quote.toUpperCase() && Number.isFinite(asset.bestand)) {
    return asset.bestand;
  }

  if (asset.currentPrice !== null && asset.currentPrice !== undefined && Number.isFinite(asset.currentPrice)) {
    return asset.currentPrice * asset.bestand;
  }

  if (asset.avgBuyPrice !== null && asset.avgBuyPrice !== undefined && Number.isFinite(asset.avgBuyPrice)) {
    return asset.avgBuyPrice * asset.bestand;
  }

  return null;
};

// Leitet den Kurs "EUR je 1 USD" aus dem Portfolio selbst ab, damit keine
// externe Wechselkursquelle nötig ist: bevorzugt eine USD|EUR-Position
// (Kurs direkt), sonst eine EUR|USD-Position (Kehrwert). Ohne solche Position: null.
const inferEurPerUsdRate = (assets: PortfolioAssetRow[]): number | null => {
  const usdInEurAsset = assets.find(
    (asset) => asset.asset.toUpperCase() === "USD" && asset.quote.toUpperCase() === "EUR",
  );

  if (usdInEurAsset) {
    const directRate =
      usdInEurAsset.currentPrice ??
      usdInEurAsset.avgBuyPrice ??
      (resolveAssetCurrentValue(usdInEurAsset) !== null && usdInEurAsset.bestand > DASHBOARD_FLOAT_EPSILON
        ? resolveAssetCurrentValue(usdInEurAsset)! / usdInEurAsset.bestand
        : null);

    if (directRate !== null && directRate > DASHBOARD_FLOAT_EPSILON) {
      return directRate;
    }
  }

  const eurInUsdAsset = assets.find(
    (asset) => asset.asset.toUpperCase() === "EUR" && asset.quote.toUpperCase() === "USD",
  );

  if (eurInUsdAsset) {
    const inverseRate =
      eurInUsdAsset.currentPrice ??
      eurInUsdAsset.avgBuyPrice ??
      (resolveAssetCurrentValue(eurInUsdAsset) !== null && eurInUsdAsset.bestand > DASHBOARD_FLOAT_EPSILON
        ? resolveAssetCurrentValue(eurInUsdAsset)! / eurInUsdAsset.bestand
        : null);

    if (inverseRate !== null && inverseRate > DASHBOARD_FLOAT_EPSILON) {
      return roundTo(1 / inverseRate);
    }
  }

  return null;
};

// Baut aus den EUR- und USD-Teilsummen die vier Sichten. Ohne Wechselkurs
// entsprechen die kombinierten Werte den reinen Quote-Summen (USD-Anteil fehlt
// dann in combinedEUR und umgekehrt).
const buildMetricSummary = (
  totals: { eur: number; usd: number },
  eurPerUsdRate: number | null,
): DashboardMetricSummary => {
  const quoteEUR = coalesceMetricValue(totals.eur);
  const quoteUSD = coalesceMetricValue(totals.usd);

  if (eurPerUsdRate === null || eurPerUsdRate <= DASHBOARD_FLOAT_EPSILON) {
    return {
      combinedEUR: quoteEUR,
      combinedUSD: quoteUSD,
      quoteEUR,
      quoteUSD,
    };
  }

  return {
    combinedEUR: coalesceMetricValue(totals.eur + totals.usd * eurPerUsdRate),
    combinedUSD: coalesceMetricValue(totals.usd + totals.eur / eurPerUsdRate),
    quoteEUR,
    quoteUSD,
  };
};

// Summiert eine Kennzahl getrennt nach Quote EUR/USD. "profit" wird bevorzugt
// als aktueller Wert − investiert berechnet (konsistent mit resolveAssetCurrentValue),
// sonst wird der gelieferte unrealisierte Gewinn übernommen.
const accumulateTotalsByQuote = (
  assets: PortfolioAssetRow[],
  kind: "portfolio" | "invested" | "profit",
  options?: { excludeFiat?: boolean },
) =>
  assets.reduce(
    (totals, asset) => {
      if (options?.excludeFiat && isFiatAsset(asset)) {
        return totals;
      }

      const quote = asset.quote.toUpperCase();

      if (quote !== "EUR" && quote !== "USD") {
        return totals;
      }

      const amount =
        kind === "portfolio"
          ? resolveAssetCurrentValue(asset)
          : kind === "invested"
            ? asset.investedNet
            : (() => {
                const currentValue = resolveAssetCurrentValue(asset);

                if (currentValue !== null && asset.investedNet !== null && asset.investedNet !== undefined) {
                  return currentValue - asset.investedNet;
                }

                return asset.unrealizedProfit;
              })();

      if (amount === null || amount === undefined || !Number.isFinite(amount)) {
        return totals;
      }

      if (quote === "EUR") {
        totals.eur += amount;
      }

      if (quote === "USD") {
        totals.usd += amount;
      }

      return totals;
    },
    { eur: 0, usd: 0 },
  );

// Index pro Asset-Symbol (Großschreibung) mit Portfolio-Zeile, Performance-Zeile
// und allen Transaktionen dieses Assets – für Detailansichten.
// Hinweis: Schlüssel ist nur das Asset; bei mehreren Quotes überschreibt die letzte Zeile.
export const byAssetLookup = (
  assets: PortfolioAssetRow[],
  performance: CoinPerformanceRow[],
  transactions: TransactionRow[],
) => {
  const txByAsset = transactions.reduce<Record<string, TransactionRow[]>>(
    (acc, tx) => {
      const key = tx.asset?.toUpperCase() ?? "";
      if (!key) return acc;
      acc[key] = acc[key] ? [...acc[key], tx] : [tx];
      return acc;
    },
    {},
  );

  return assets.reduce<
    Record<
      string,
      {
        portfolio?: PortfolioAssetRow;
        performance?: CoinPerformanceRow;
        transactions: TransactionRow[];
      }
    >
  >((acc, asset) => {
    const key = asset.asset.toUpperCase();
    acc[key] = {
      portfolio: asset,
      performance: performance.find((p) => p.asset.toUpperCase() === key),
      transactions: txByAsset[key] ?? [],
    };
    return acc;
  }, {});
};

// Einfache Zählwerte für das Dashboard. Die größte Position wird nach dem
// Rohwert currentValue bestimmt, ohne Währungsumrechnung zwischen Quotes.
export const dashboardDerived = (
  assets: PortfolioAssetRow[],
  transactions: TransactionRow[],
) => {
  const profitable = assets.filter((a) => (a.unrealizedProfit ?? 0) > 0);
  const losing = assets.filter((a) => (a.unrealizedProfit ?? 0) < 0);
  const largest = [...assets].sort(
    (a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0),
  )[0];
  return {
    assetsHeld: assets.length,
    txCount: transactions.length,
    profitableAssets: profitable.length,
    losingAssets: losing.length,
    largestPosition: largest?.asset ?? null,
  };
};

// Einfache Gesamtsummen je Quote EUR/USD (ohne Fiat-Ausschluss, ohne Ersatzwerte
// und ohne Wechselkurs). Performance als Anteil (Gewinn / investiert).
// Hinweis: Wird derzeit im Code nicht aufgerufen; das Dashboard nutzt deriveDashboardSummary.
export const derivePortfolioSummary = (
  assets: PortfolioAssetRow[],
): PortfolioSummary => {
  const summary: PortfolioSummary = {
    totalPortfolioValueEUR: null,
    totalPortfolioValueUSD: null,
    totalInvestedEUR: null,
    totalInvestedUSD: null,
    totalProfitEUR: null,
    totalProfitUSD: null,
    performanceEUR: null,
    performanceUSD: null,
  };

  assets.forEach((asset) => {
    const quote = asset.quote?.toUpperCase();
    const investedNet = asset.investedNet ?? 0;
    const currentValue = asset.currentValue ?? 0;

    if (quote === "EUR") {
      summary.totalInvestedEUR = (summary.totalInvestedEUR ?? 0) + investedNet;
      summary.totalPortfolioValueEUR = (summary.totalPortfolioValueEUR ?? 0) + currentValue;
    }

    if (quote === "USD") {
      summary.totalInvestedUSD = (summary.totalInvestedUSD ?? 0) + investedNet;
      summary.totalPortfolioValueUSD = (summary.totalPortfolioValueUSD ?? 0) + currentValue;
    }
  });

  if (summary.totalInvestedEUR !== null && summary.totalPortfolioValueEUR !== null) {
    summary.totalProfitEUR = summary.totalPortfolioValueEUR - summary.totalInvestedEUR;
    summary.performanceEUR =
      summary.totalInvestedEUR > 0 ? summary.totalProfitEUR / summary.totalInvestedEUR : null;
  }

  if (summary.totalInvestedUSD !== null && summary.totalPortfolioValueUSD !== null) {
    summary.totalProfitUSD = summary.totalPortfolioValueUSD - summary.totalInvestedUSD;
    summary.performanceUSD =
      summary.totalInvestedUSD > 0 ? summary.totalProfitUSD / summary.totalInvestedUSD : null;
  }

  return summary;
};

// Kennzahlen für die Übersichtskarten des Dashboards. Portfoliowert inkl. Fiat,
// investiert und Gewinn ohne Fiat; Performance = Gewinn / investiert (Anteil),
// jeweils kombiniert (EUR-Basis) sowie getrennt für EUR- und USD-Positionen.
export const deriveDashboardSummary = (assets: PortfolioAssetRow[]): DashboardSummary => {
  const eurPerUsdRate = inferEurPerUsdRate(assets);
  const portfolioTotals = accumulateTotalsByQuote(assets, "portfolio");
  const investedTotals = accumulateTotalsByQuote(assets, "invested", { excludeFiat: true });
  const profitTotals = accumulateTotalsByQuote(assets, "profit", { excludeFiat: true });
  const investedSummary = buildMetricSummary(investedTotals, eurPerUsdRate);
  const profitSummary = buildMetricSummary(profitTotals, eurPerUsdRate);
  const combinedPerformance =
    investedSummary.combinedEUR !== null &&
    investedSummary.combinedEUR > DASHBOARD_FLOAT_EPSILON &&
    profitSummary.combinedEUR !== null
      ? roundTo(profitSummary.combinedEUR / investedSummary.combinedEUR)
      : null;
  const eurPerformance =
    investedSummary.quoteEUR !== null &&
    investedSummary.quoteEUR > DASHBOARD_FLOAT_EPSILON &&
    profitSummary.quoteEUR !== null
      ? roundTo(profitSummary.quoteEUR / investedSummary.quoteEUR)
      : null;
  const usdPerformance =
    investedSummary.quoteUSD !== null &&
    investedSummary.quoteUSD > DASHBOARD_FLOAT_EPSILON &&
    profitSummary.quoteUSD !== null
      ? roundTo(profitSummary.quoteUSD / investedSummary.quoteUSD)
      : null;

  return {
    portfolio: buildMetricSummary(portfolioTotals, eurPerUsdRate),
    invested: investedSummary,
    profit: profitSummary,
    performance: {
      combined: combinedPerformance,
      eur: eurPerformance,
      usd: usdPerformance,
    },
  };
};
