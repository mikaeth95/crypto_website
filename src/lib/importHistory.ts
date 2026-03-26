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
