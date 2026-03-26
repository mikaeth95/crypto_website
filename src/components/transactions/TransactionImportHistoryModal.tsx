import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, History, X } from "lucide-react";
import { IMPORT_PLATFORM_OPTIONS } from "../../lib/transactionImports";
import type { ImportHistoryFileRecord } from "../../types/supabase";

interface TransactionImportHistoryModalProps {
  open: boolean;
  historyFiles: ImportHistoryFileRecord[];
  downloadingFileId?: string | null;
  errorMessage?: string | null;
  onClose: () => void;
  onDownload: (historyFile: ImportHistoryFileRecord) => Promise<void>;
}

const formatImportedAt = (value: string) => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatFileSize = (value: number | string) => {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return "Unknown size";
  }

  if (numericValue < 1024) {
    return `${numericValue} B`;
  }

  if (numericValue < 1024 * 1024) {
    return `${(numericValue / 1024).toFixed(1)} KB`;
  }

  return `${(numericValue / (1024 * 1024)).toFixed(2)} MB`;
};

export const TransactionImportHistoryModal = ({
  open,
  historyFiles,
  downloadingFileId,
  errorMessage,
  onClose,
  onDownload,
}: TransactionImportHistoryModalProps) => {
  const platformLabels = useMemo(
    () =>
      Object.fromEntries(IMPORT_PLATFORM_OPTIONS.map((option) => [option.id, option.label])),
    [],
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0.95, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ type: "spring", damping: 22, stiffness: 220 }}
            className="w-full max-w-3xl rounded-[18px] border border-border/90 bg-panel p-5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label">Transactions</p>
                <div className="flex items-center gap-2">
                  <History size={18} className="text-[#b8c9ff]" />
                  <h2 className="text-xl font-semibold tracking-tight text-slate-100">Import History</h2>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Download the original CSV files that were saved during each import.
                </p>
              </div>
              <button className="button-surface p-2" onClick={onClose} aria-label="Close import history modal">
                <X size={16} />
              </button>
            </div>

            {errorMessage ? (
              <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {errorMessage}
              </p>
            ) : null}

            {!historyFiles.length ? (
              <div className="rounded-[18px] border border-dashed border-border/80 bg-panelSoft/60 px-4 py-6">
                <p className="text-sm font-medium text-slate-200">No saved import files yet.</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Imported CSVs will appear here after the first successful transaction import.
                </p>
              </div>
            ) : (
              <div className="rounded-[18px] border border-border/80 bg-panelSoft/40 p-2">
                <ul className="max-h-[26rem] space-y-3 overflow-y-auto pr-1" aria-label="Saved import history files">
                  {historyFiles.map((historyFile) => {
                  const isDownloading = downloadingFileId === historyFile.id;
                  const platformLabel = platformLabels[historyFile.source_platform] ?? historyFile.source_platform;

                  return (
                    <li
                      key={historyFile.id}
                      className="rounded-[18px] border border-border/80 bg-panelSoft/60 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div>
                            <p className="text-sm font-medium text-slate-100">{historyFile.stored_file_name}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              Imported {formatImportedAt(historyFile.imported_at)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                            <span className="rounded-md border border-border/80 bg-black/10 px-2 py-1">
                              {platformLabel}
                            </span>
                            <span className="rounded-md border border-border/80 bg-black/10 px-2 py-1">
                              {formatFileSize(historyFile.file_size_bytes)}
                            </span>
                          </div>
                          {historyFile.original_file_name ? (
                            <p className="text-sm text-slate-400">
                              Original file: <span className="text-slate-300">{historyFile.original_file_name}</span>
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className="button-primary shrink-0"
                          onClick={() => void onDownload(historyFile)}
                          disabled={isDownloading}
                        >
                          <Download size={14} />
                          {isDownloading ? "Downloading..." : "Download"}
                        </button>
                      </div>
                    </li>
                  );
                  })}
                </ul>
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
