/**
 * Robuste Parser für Zahlen, Einheiten und Datumswerte
 *
 * Zweck:
 *   Wandelt die heterogenen Rohwerte aus Excel-Blättern und Supabase-Feldern
 *   (Zahlen als Text, teils mit Einheit wie "0.5 (BTC)" oder Dezimalkomma) in
 *   saubere Zahlen bzw. ISO-Datumsstrings um. Wird von allen Berechnungsmodulen
 *   (FIFO, Dashboard-Kennzahlen, Live-Chart-Käufe) verwendet.
 *
 * Eingaben:
 *   Beliebige Werte (unknown): number, string, null/undefined.
 *
 * Ausgaben:
 *   - parseLocalizedNumber: number | null
 *   - extractUnit: Text in der ersten Klammer, z. B. "BTC", oder null
 *   - parseDisplayAndNumber: Originaltext für die Anzeige + geparste Zahl
 *   - safeDate: "YYYY-MM-DD" (UTC) oder null
 *
 * Annahmen:
 *   - Ungültige oder leere Eingaben ergeben null statt einer Exception, damit
 *     einzelne fehlerhafte Zellen nicht die ganze Auswertung abbrechen.
 *   - parseLocalizedNumber entfernt Leerzeichen, ersetzt nur das ERSTE Komma durch
 *     einen Punkt und nimmt dann die erste Zahl im Text. Tausendertrennzeichen
 *     (z. B. "1.234,56" oder "1,234.56") werden nicht unterstützt; Exponential-
 *     schreibweise in Strings ("1e-7") ebenfalls nicht.
 *   - safeDate nutzt den JavaScript-Date-Parser und gibt das Datum in UTC zurück;
 *     Zeitangaben ohne Zeitzone werden als Ortszeit gelesen.
 */

// Liest eine Zahl aus Text oder Zahl; nicht endliche Zahlen ergeben null.
export const parseLocalizedNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Dezimalkomma -> Punkt; danach die erste Zahl extrahieren, damit Zusätze wie
  // Einheiten oder Währungen ("12.5 EUR", "0.5 (BTC)") ignoriert werden.
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
};

// Holt die Einheit aus Werten der Form "0.5 (BTC)".
export const extractUnit = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\(([^)]+)\)/);
  return match?.[1]?.trim() || null;
};

// Behält den Originaltext für die Anzeige und liefert zusätzlich die Zahl zum Rechnen.
export const parseDisplayAndNumber = (
  value: unknown,
): { display: string; number: number | null } => {
  const display = value === null || value === undefined ? "" : String(value);
  return { display, number: parseLocalizedNumber(value) };
};

// Normiert ein Datum auf "YYYY-MM-DD" (UTC); ungültige Werte ergeben null.
export const safeDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};
