/**
 * Anzeigeformatierung von Beträgen, Mengen und Prozentwerten
 *
 * Zweck:
 *   Einheitliche Darstellung von Zahlen in Tabellen, Karten und Charts des
 *   Dashboards sowie die Farbklasse für positive/negative Werte (Gewinn/Verlust).
 *
 * Eingaben:
 *   number | null | undefined, ggf. Währungs- bzw. Quote-Kürzel und Optionen.
 *
 * Ausgaben:
 *   Formatierte Strings (z. B. "1,234.56 EUR", "12.50%") bzw. ein Tailwind-
 *   Klassenname (signedClass).
 *
 * Annahmen:
 *   - Fehlende Werte werden als "n/a" angezeigt.
 *   - Zahlenformat ist bewusst "en-US" (Punkt als Dezimaltrennzeichen, Komma als
 *     Tausendertrennzeichen), unabhängig von der Browsersprache.
 *   - Prozentwerte werden bereits in Prozent erwartet (12.5 -> "12.50%"); Anteile
 *     müssen vorher mit 100 multipliziert werden.
 *   - Die Rundung erfolgt nur für die Anzeige (toLocaleString), Rechenwerte bleiben unverändert.
 */

// Betrag mit genau 2 Nachkommastellen und nachgestelltem Währungskürzel.
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

// Mengen (z. B. Coin-Bestand) mit bis zu maxFractionDigits Nachkommastellen, ohne Nullen aufzufüllen.
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

// Prozentwert mit 2 Nachkommastellen; Eingabe bereits in Prozent.
export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "n/a";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
};

// Kompakte Prozentangabe für Chart-Achsen/Tooltips, optional mit "+" bei positiven Werten.
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

// Kurs für Charts/Tooltips; Quote-Kürzel wird angehängt, falls vorhanden.
export const formatChartPrice = (
  value: number | null | undefined,
  quote: string | null | undefined,
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";

  // Nachkommastellen an die Größenordnung anpassen: große Kurse (BTC) brauchen
  // 2 Stellen, Kleinstkurse (z. B. Meme-Coins unter 1) bis zu 6 Stellen.
  const absoluteValue = Math.abs(value);
  const maximumFractionDigits = absoluteValue >= 1_000 ? 2 : absoluteValue >= 1 ? 4 : 6;
  const formattedValue = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });

  return quote ? `${formattedValue} ${quote}` : formattedValue;
};

// Kurzschreibweise für große Zahlen wie Handelsvolumen (z. B. "1.2M").
export const formatCompact = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "n/a";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
};

// Farbklasse für Gewinn (grün), Verlust (rot) oder neutral/unbekannt (grau).
export const signedClass = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "text-slate-300";
  if (value > 0) return "text-pos";
  if (value < 0) return "text-neg";
  return "text-slate-300";
};
