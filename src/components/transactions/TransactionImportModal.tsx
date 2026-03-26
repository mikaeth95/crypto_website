import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Upload, X } from "lucide-react";
import {
  IMPORT_PLATFORM_OPTIONS,
  type SupportedImportPlatform,
} from "../../lib/transactionImports";

interface TransactionImportModalProps {
  open: boolean;
  importing: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onImport: (file: File, platform: SupportedImportPlatform) => Promise<void>;
}

const controlClassName =
  "control-surface";

export const TransactionImportModal = ({
  open,
  importing,
  errorMessage,
  onClose,
  onImport,
}: TransactionImportModalProps) => {
  const defaultPlatform = IMPORT_PLATFORM_OPTIONS[0]?.id ?? "crypto_com_exchange";
  const [platform, setPlatform] = useState<SupportedImportPlatform>(defaultPlatform);
  const [file, setFile] = useState<File | null>(null);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPlatform(defaultPlatform);
    setFile(null);
    setLocalErrorMessage(null);
  }, [defaultPlatform, open]);

  const selectedFileLabel = useMemo(
    () => (file ? `${file.name} • ${(file.size / 1024).toFixed(1)} KB` : "No file selected"),
    [file],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalErrorMessage(null);

    if (!file) {
      setLocalErrorMessage("Choose a CSV export before importing.");
      return;
    }

    try {
      await onImport(file, platform);
    } catch (error) {
      setLocalErrorMessage(
        error instanceof Error ? error.message : "Failed to import the selected file.",
      );
    }
  };

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
            className="w-full max-w-xl rounded-[18px] border border-border/90 bg-panel p-5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label">Transactions</p>
                <h2 className="text-xl font-semibold tracking-tight text-slate-100">Import Transaction File</h2>
              </div>
              <button
                className="button-surface p-2"
                onClick={onClose}
                aria-label="Close import modal"
                disabled={importing}
              >
                <X size={16} />
              </button>
            </div>

            <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Platform</span>
                <select
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value as SupportedImportPlatform)}
                  className={controlClassName}
                  aria-label="Select import platform"
                  disabled={importing}
                >
                  {IMPORT_PLATFORM_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">CSV File</span>
                <div className="rounded-[18px] border border-dashed border-border/80 bg-panelSoft/60 p-4">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-lg file:border file:border-accent/35 file:bg-accent/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#c2d1ff] hover:file:bg-accent/15"
                    disabled={importing}
                  />
                  <p className="mt-3 text-sm text-slate-400">{selectedFileLabel}</p>
                </div>
              </label>

              {localErrorMessage || errorMessage ? (
                <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {localErrorMessage ?? errorMessage}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="button-surface"
                  onClick={onClose}
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={importing}
                >
                  <Upload size={14} />
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
