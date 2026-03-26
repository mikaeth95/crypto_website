export const parseLocalizedNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
};

export const extractUnit = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\(([^)]+)\)/);
  return match?.[1]?.trim() || null;
};

export const parseDisplayAndNumber = (
  value: unknown,
): { display: string; number: number | null } => {
  const display = value === null || value === undefined ? "" : String(value);
  return { display, number: parseLocalizedNumber(value) };
};

export const safeDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};
