export const formatCurrency = (
  value: number | null | undefined,
  currency: "EUR" | "USD",
) => {
  if (value === null || value === undefined) return "n/a";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
};

export const formatNumber = (
  value: number | null | undefined,
  maxFractionDigits = 4,
) => {
  if (value === null || value === undefined) return "n/a";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
};

export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "n/a";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
};

export const formatChartPercent = (
  value: number | null | undefined,
  { signed = false, maximumFractionDigits = 1 }: { signed?: boolean; maximumFractionDigits?: number } = {},
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";

  const sign = signed && value > 0 ? "+" : "";

  return `${sign}${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}%`;
};

export const formatCompact = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "n/a";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
};

export const signedClass = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "text-slate-300";
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-slate-300";
};
