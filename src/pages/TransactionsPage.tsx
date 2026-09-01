import { useState } from "react";
import { History, Upload } from "lucide-react";
import { TransactionImportHistoryModal } from "../components/transactions/TransactionImportHistoryModal";
import { TransactionImportModal } from "../components/transactions/TransactionImportModal";
import { TransactionsTable } from "../components/transactions/TransactionsTable";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { PageHeader } from "../components/ui/page-header";
import { useAppData } from "../hooks/useAppData";
import { useUserData } from "../hooks/useUserData";
import {
  IMPORT_PLATFORM_OPTIONS,
  type SupportedImportPlatform,
} from "../lib/transactionImports";
import type { WorkbookData } from "../types/portfolio";

type ImportSummary = {
  fileName: string;
  originalFileName: string;
  importedCount: number;
  skippedCount: number;
  totalParsedCount: number;
  platform: SupportedImportPlatform;
};

const actionButtonClassName = "button-primary";

export const TransactionsPage = ({ data }: { data: WorkbookData }) => {
  const { downloadImportHistoryFile, error, importHistoryFiles, importTransactionsFromFile, importing } =
    useAppData();
  const { loading: userDataLoading, selectedRepresentedAccount } = useUserData();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportHistoryModalOpen, setIsImportHistoryModalOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const handleImport = async (file: File, platform: SupportedImportPlatform) => {
    const summary = await importTransactionsFromFile(file, platform);

    setImportSummary(summary);
    setIsImportModalOpen(false);
  };

  const handleDownloadImportHistoryFile = async (historyFile: (typeof importHistoryFiles)[number]) => {
    setDownloadError(null);
    setDownloadingFileId(historyFile.id);

    try {
      await downloadImportHistoryFile(historyFile);
    } catch (downloadImportError) {
      setDownloadError(
        downloadImportError instanceof Error
          ? downloadImportError.message
          : "Failed to download the selected import history file.",
      );
    } finally {
      setDownloadingFileId(null);
    }
  };

  const importedPlatformLabel =
    importSummary && IMPORT_PLATFORM_OPTIONS.find((option) => option.id === importSummary.platform)?.label;

  return (
    <>
      <div className="space-y-4">
        <PageHeader
          title="Transactions"
          description="Import exchange exports and keep only new transaction rows in the dashboard."
          updatedAt={data.loadedAt}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{data.transactions.length} Entries</Badge>
              <button
                type="button"
                className="button-surface"
                onClick={() => {
                  setDownloadError(null);
                  setIsImportHistoryModalOpen(true);
                }}
              >
                <History size={14} />
                Import History
              </button>
              <button
                type="button"
                className={actionButtonClassName}
                onClick={() => setIsImportModalOpen(true)}
              >
                <Upload size={14} />
                Import
              </button>
            </div>
          }
        />

        {importSummary ? (
          <Card className="border-emerald-500/25 bg-emerald-500/10">
            <p className="text-sm font-medium text-emerald-200">Import completed</p>
            <p className="mt-1 text-sm text-emerald-100">
              {importSummary.importedCount} new transaction{importSummary.importedCount === 1 ? "" : "s"} added
              from {importedPlatformLabel ?? importSummary.platform}. {importSummary.skippedCount} duplicate
              entr{importSummary.skippedCount === 1 ? "y was" : "ies were"} skipped.
            </p>
            <p className="mt-2 text-xs text-emerald-200/80">
              Saved file: {importSummary.fileName} | Original: {importSummary.originalFileName} | Parsed rows:{" "}
              {importSummary.totalParsedCount}
            </p>
          </Card>
        ) : null}

        {error ? (
          <Card className="border-rose-500/25 bg-rose-500/10">
            <p className="text-sm font-medium text-rose-200">Import error</p>
            <p className="mt-1 text-sm text-rose-100">{error}</p>
          </Card>
        ) : null}

        {!selectedRepresentedAccount ? (
          <Card>
            <p className="text-sm font-medium text-slate-200">
              {userDataLoading ? "Loading represented account..." : "No represented account selected."}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              You can still open the import modal. If there is no active represented account yet, the import
              dialog will show the exact error when you submit.
            </p>
          </Card>
        ) : null}

        {!data.transactions.length ? (
          <Card>
            <p className="text-sm font-medium text-slate-200">No transactions imported yet.</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Use the import button to load a Crypto.com Exchange CSV export. Existing transaction ids are checked,
              so re-importing the same file only adds new rows.
            </p>
          </Card>
        ) : null}

        <TransactionsTable rows={data.transactions} />
      </div>

      <TransactionImportModal
        open={isImportModalOpen}
        importing={importing}
        errorMessage={error}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImport}
      />

      <TransactionImportHistoryModal
        open={isImportHistoryModalOpen}
        historyFiles={importHistoryFiles}
        downloadingFileId={downloadingFileId}
        errorMessage={downloadError}
        onClose={() => setIsImportHistoryModalOpen(false)}
        onDownload={handleDownloadImportHistoryFile}
      />
    </>
  );
};
