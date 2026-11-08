/**
 * Ablage importierter CSV-Dateien im Supabase-Storage.
 *
 * Zweck:
 *   Erzeugt eindeutige Dateinamen und Speicherpfade für importierte Dateien.
 *
 * Eingaben:
 *   Plattform, Benutzer-id, Konto-id, Zeitpunkt.
 *
 * Ausgaben:
 *   Dateiname "<plattform>-<zeitstempel>.csv" und Pfad
 *   "<benutzer-id>/<konto-id>/<dateiname>".
 *
 * Annahmen:
 *   - Der erste Ordner des Pfads muss die Benutzer-id sein. Darauf prüfen die
 *     Storage-Zugriffsregeln in schema.sql.
 *   - Der Zeitstempel hat Millisekunden und ist damit je Konto praktisch eindeutig.
 */
import type { SupportedImportPlatform } from "./transactionImports";

export const IMPORT_HISTORY_BUCKET = "transaction-import-history";

const FILE_NAME_SAFE_SEPARATOR = "-";

const sanitizeFileNameSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, FILE_NAME_SAFE_SEPARATOR)
    .replace(/^-+|-+$/g, "");

export const formatImportHistoryTimestamp = (value: Date = new Date()) =>
  value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.(\d{3})Z$/, "$1Z");

export const buildImportHistoryStoredFileName = (
  platform: SupportedImportPlatform,
  value: Date = new Date(),
) => `${sanitizeFileNameSegment(platform)}-${formatImportHistoryTimestamp(value)}.csv`;

export const buildImportHistoryStoragePath = (
  ownerUserId: string,
  representedAccountId: string,
  storedFileName: string,
) => `${ownerUserId}/${representedAccountId}/${storedFileName}`;
