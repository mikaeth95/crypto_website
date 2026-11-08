/**
 * Export von Tabellen als CSV- oder Excel-Datei
 *
 * Zweck:
 *   Ermöglicht den Download beliebiger Dashboard-Tabellen (z. B. Transaktionen,
 *   Trade-Historie) als .csv oder .xlsx direkt im Browser, ohne Server.
 *
 * Eingaben:
 *   - rows: die anzuzeigenden Datenzeilen (generischer Typ T, z. B. bereits gefiltert),
 *   - config: Dateiname, optionaler Blattname und Spaltendefinitionen
 *     (Überschrift + Funktion, die den Zellwert aus einer Zeile liest),
 *   - format: "csv" oder "xlsx".
 *
 * Ausgaben:
 *   Keine Rückgabe; löst im Browser den Download der Datei aus (Seiteneffekt).
 *
 * Annahmen:
 *   - Reihenfolge und Inhalt der Spalten bestimmt allein config.columns.
 *   - Textwerte, die mit =, +, -, @, Tab oder CR beginnen, erhalten ein
 *     vorangestelltes Apostroph (Schutz vor CSV-/Formel-Injection). Zahlen bleiben
 *     unverändert; nur Strings wie "-5" werden dadurch zu Text.
 *   - CSV wird mit UTF-8-BOM geschrieben, damit Excel Umlaute korrekt erkennt;
 *     Trennzeichen ist das Komma (Standard von SheetJS).
 *   - Ungültige Zeichen in Datei- und Blattnamen werden durch "-" ersetzt;
 *     Blattnamen werden auf 31 Zeichen (Excel-Grenze) gekürzt.
 *   - Spaltenbreite in xlsx: nach längstem Inhalt, maximal 32 Zeichen.
 */
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

// Entfernt Zeichen, die unter Windows/macOS in Dateinamen unzulässig sind.
const sanitizeFileName = (value: string) => value.trim().replace(/[<>:"/\\|?*]+/g, "-") || "export";

// Excel verbietet \ / ? * : [ ] in Blattnamen und erlaubt max. 31 Zeichen.
const sanitizeSheetName = (value: string) => value.replace(/[\\/?*:[\]]+/g, "-").slice(0, 31) || "Export";

const sanitizeSpreadsheetValue = (value: TableExportValue): TableExportValue => {
  if (!(typeof value === "string")) {
    return value ?? "";
  }

  // Prevent spreadsheet applications from evaluating imported text as a formula.
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
};

// Baut aus Zeilen und Spaltendefinitionen ein SheetJS-Arbeitsblatt; dient als
// gemeinsame Grundlage für CSV und xlsx.
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

// Download über einen temporären <a download>-Link; die Objekt-URL wird danach
// wieder freigegeben, um Speicherlecks zu vermeiden.
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

// Öffentliche Export-Funktion: erzeugt die Datei im gewünschten Format und startet den Download.
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
