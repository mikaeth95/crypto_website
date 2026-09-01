import * as XLSX from "xlsx";

export type TableExportValue = string | number | boolean | Date | null | undefined;

export type TableExportColumn<T> = {
  header: string;
  value: (row: T) => TableExportValue;
};

export type TableExportConfig<T> = {
  fileName: string;
  sheetName?: string;
  columns: TableExportColumn<T>[];
};

export type TableExportFormat = "csv" | "xlsx";

const sanitizeFileName = (value: string) => value.trim().replace(/[<>:"/\\|?*]+/g, "-") || "export";

const sanitizeSheetName = (value: string) => value.replace(/[\\/?*:[\]]+/g, "-").slice(0, 31) || "Export";

const sanitizeSpreadsheetValue = (value: TableExportValue): TableExportValue => {
  if (!(typeof value === "string")) {
    return value ?? "";
  }

  // Prevent spreadsheet applications from evaluating imported text as a formula.
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
};

const buildWorksheet = <T>(rows: T[], columns: TableExportColumn<T>[]) => {
  const records = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.header, sanitizeSpreadsheetValue(column.value(row))])),
  );
  const worksheet = XLSX.utils.json_to_sheet(records, {
    header: columns.map((column) => column.header),
  });

  worksheet["!cols"] = columns.map((column) => ({
    wch: Math.min(
      32,
      Math.max(
        column.header.length + 2,
        ...rows.map((row) => String(column.value(row) ?? "").length + 2),
      ),
    ),
  }));

  return worksheet;
};

const downloadBlob = (contents: BlobPart, fileName: string, type: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const exportTableRows = <T>(rows: T[], config: TableExportConfig<T>, format: TableExportFormat) => {
  const fileName = sanitizeFileName(config.fileName);
  const worksheet = buildWorksheet(rows, config.columns);

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    downloadBlob(`\uFEFF${csv}`, `${fileName}.csv`, "text/csv;charset=utf-8");
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(config.sheetName ?? "Export"));
  XLSX.writeFile(workbook, `${fileName}.xlsx`, { compression: true });
};
