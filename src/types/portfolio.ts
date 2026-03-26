export interface TransactionRow {
  datum: string | null;
  typ: string;
  asset: string;
  quote: string | null;
  menge: string;
  ausfuehrungspreis: string | null;
  bruttoWert: string;
  gebuehr: string | null;
  waehrungGebuehr: string | null;
  nettomenge: string;
  nettowert: string;
  transaktionId: string;
  orderId: string | null;
  tradeId: string | null;
  clientOrderId: string | null;
  tradeMatchId: string | null;
  journalIds: string[];
  boerse: string;
  datenquelle: string;
}

export interface PortfolioSummary {
  totalPortfolioValueEUR: number | null;
  totalPortfolioValueUSD: number | null;
  totalInvestedEUR: number | null;
  totalInvestedUSD: number | null;
  totalProfitEUR: number | null;
  totalProfitUSD: number | null;
  performanceEUR: number | null;
  performanceUSD: number | null;
}

export interface PortfolioAssetRow {
  asset: string;
  quote: string;
  bestand: number;
  bestandDisplay: string;
  avgBuyPrice: number | null;
  avgBuyDisplay: string;
  investedNet: number | null;
  investedNetDisplay: string;
  totalFees: number | null;
  totalFeesDisplay: string;
  currentPrice: number | null;
  currentPriceDisplay: string;
  currentValue: number | null;
  currentValueDisplay: string;
  unrealizedProfit: number | null;
  unrealizedProfitDisplay: string;
  unrealizedProfitPct: number | null;
  portfolioPct: number | null;
  trades: number | null;
  ath: number | null;
  athDate: string | null;
}

export interface CoinPerformanceRow {
  asset: string;
  currentPrice: number | null;
  ath: number | null;
  athDate: string | null;
  athDrawdownPct: number | null;
  change1D: number | null;
  change7D: number | null;
  change30D: number | null;
  change90D: number | null;
  change1Y: number | null;
  high30D: number | null;
  low30D: number | null;
  range30DPct: number | null;
  high1Y: number | null;
  drawdown1YPct: number | null;
  vol30D: number | null;
  vol90D: number | null;
  avgBuy: number | null;
  distanceAvgPct: number | null;
  cmcLinkLabel: string | null;
  cmcUrl?: string | null;
}

export interface WorkbookData {
  fileName: string;
  loadedAt: string;
  summary: PortfolioSummary;
  assets: PortfolioAssetRow[];
  transactions: TransactionRow[];
  performance: CoinPerformanceRow[];
  errors: string[];
}
