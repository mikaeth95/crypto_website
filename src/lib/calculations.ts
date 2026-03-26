import type {
  CoinPerformanceRow,
  PortfolioAssetRow,
  PortfolioSummary,
  TransactionRow,
} from "../types/portfolio";

const DASHBOARD_FIAT_ASSETS = new Set(["EUR", "USD", "USDC", "USDT", "USDP", "DAI", "TUSD", "USDE"]);
const DASHBOARD_FLOAT_EPSILON = 1e-9;

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
