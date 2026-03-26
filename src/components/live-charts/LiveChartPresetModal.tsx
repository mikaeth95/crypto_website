import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { createLiveChartPreset } from "../../lib/liveChartPresets";
import {
  LIVE_CHART_PROVIDER,
  LIVE_CHART_PROVIDER_LABELS,
  formatMarketSymbol,
  normalizeMarketSymbol,
  type LiveChartAssetOption,
  type LiveChartPreset,
  type LiveChartProvider,
  type MarketSymbol,
} from "../../types/market";
import { Input } from "../ui/input";

interface LiveChartPresetModalProps {
  open: boolean;
  portfolioAssets: LiveChartAssetOption[];
  onClose: () => void;
  onCreate: (preset: LiveChartPreset) => Promise<boolean>;
  title?: string;
  submitLabel?: string;
  initialName?: string;
  initialAssets?: MarketSymbol[];
  submitErrorMessage?: string | null;
  submitting?: boolean;
}

const controlClassName =
  "control-surface";

const actionButtonClassName =
  "button-surface";

export const LiveChartPresetModal = ({
  open,
  portfolioAssets,
  onClose,
  onCreate,
  title = "Add Preset",
  submitLabel = "Create Preset",
  initialName = "",
  initialAssets = [],
  submitErrorMessage,
  submitting = false,
}: LiveChartPresetModalProps) => {
  const [provider, setProvider] = useState<LiveChartProvider>(LIVE_CHART_PROVIDER);
  const [name, setName] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<MarketSymbol[]>([]);
  const [selectedPortfolioAsset, setSelectedPortfolioAsset] = useState("");
  const [manualAssetInput, setManualAssetInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availablePortfolioAssets = useMemo(
    () => portfolioAssets.filter((asset) => !selectedAssets.includes(asset.symbol)),
    [portfolioAssets, selectedAssets],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setProvider(LIVE_CHART_PROVIDER);
    setName(initialName);
    setSelectedAssets(initialAssets);
    setSelectedPortfolioAsset("");
    setManualAssetInput("");
    setErrorMessage(null);
  }, [initialAssets, initialName, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!availablePortfolioAssets.length) {
      setSelectedPortfolioAsset("");
      return;
    }

    if (!selectedPortfolioAsset || !availablePortfolioAssets.some((asset) => asset.symbol === selectedPortfolioAsset)) {
      setSelectedPortfolioAsset(availablePortfolioAssets[0].symbol);
    }
  }, [availablePortfolioAssets, open, selectedPortfolioAsset]);

  const addAsset = (symbolInput: string) => {
    const normalizedSymbol = normalizeMarketSymbol(symbolInput);

    if (!normalizedSymbol) {
      setErrorMessage("Enter a valid asset pair such as ADA / EUR or ADA_EUR.");
      return;
    }

    if (selectedAssets.includes(normalizedSymbol)) {
      setErrorMessage("That asset is already selected.");
      return;
    }

    if (selectedAssets.length >= 4) {
      setErrorMessage("You can add up to 4 assets per preset.");
      return;
    }

    setSelectedAssets((currentAssets) => [...currentAssets, normalizedSymbol]);
    setManualAssetInput("");
    setErrorMessage(null);
  };

  const removeAsset = (symbol: MarketSymbol) => {
    setSelectedAssets((currentAssets) => currentAssets.filter((asset) => asset !== symbol));
    setErrorMessage(null);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Preset name is required.");
      return;
    }

    if (selectedAssets.length === 0) {
      setErrorMessage("Select at least one asset.");
      return;
    }

    const preset = createLiveChartPreset({
      provider,
      name: trimmedName,
      assets: selectedAssets,
    });

    const created = await onCreate(preset);

    if (created) {
      onClose();
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
            className="w-full max-w-2xl rounded-[18px] border border-border/90 bg-panel p-5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="terminal-label">Live Charts</p>
                <h2 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h2>
              </div>
              <button
                className="button-surface p-2"
                onClick={onClose}
                aria-label="Close add preset modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Provider</span>
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as LiveChartProvider)}
                  className={controlClassName}
                  aria-label="Select preset provider"
                >
                  <option value={LIVE_CHART_PROVIDER}>{LIVE_CHART_PROVIDER_LABELS[LIVE_CHART_PROVIDER]}</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Preset Name</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="My preset"
                  aria-label="Preset name"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-200">Portfolio Assets</p>
                {availablePortfolioAssets.length ? (
                  <div className="flex gap-2">
                    <select
                      value={selectedPortfolioAsset}
                      onChange={(event) => setSelectedPortfolioAsset(event.target.value)}
                      className={controlClassName}
                      aria-label="Select a portfolio asset"
                    >
                      {availablePortfolioAssets.map((asset) => (
                        <option key={asset.symbol} value={asset.symbol}>
                          {asset.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={actionButtonClassName}
                      onClick={() => addAsset(selectedPortfolioAsset)}
                      disabled={!selectedPortfolioAsset || selectedAssets.length >= 4}
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-border/70 bg-panelSoft/60 px-3 py-2 text-sm text-slate-400">
                    No additional portfolio assets available.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-200">Manual Asset</p>
                <div className="flex gap-2">
                  <Input
                    value={manualAssetInput}
                    onChange={(event) => setManualAssetInput(event.target.value)}
                    placeholder="TRX / USD"
                    aria-label="Manual asset pair"
                  />
                  <button
                    type="button"
                    className={actionButtonClassName}
                    onClick={() => addAsset(manualAssetInput)}
                    disabled={!manualAssetInput.trim() || selectedAssets.length >= 4}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-200">Selected Assets</p>
                <p className="text-xs text-slate-500">{selectedAssets.length} / 4</p>
              </div>
              <div className="min-h-14 rounded-[16px] border border-border/70 bg-panelSoft/60 p-3">
                {selectedAssets.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedAssets.map((asset) => (
                      <span
                        key={asset}
                        className="inline-flex items-center gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-1.5 text-sm text-[#c2d1ff]"
                      >
                        {formatMarketSymbol(asset)}
                        <button
                          type="button"
                          className="rounded-full text-[#c2d1ff] transition hover:text-white"
                          onClick={() => removeAsset(asset)}
                          aria-label={`Remove ${formatMarketSymbol(asset)}`}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Add between 1 and 4 assets to build the preset.</p>
                )}
              </div>
            </div>

            {errorMessage || submitErrorMessage ? (
              <p className="mt-4 text-sm text-rose-300">{errorMessage ?? submitErrorMessage}</p>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="button-surface"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => void handleCreate()}
                disabled={submitting}
              >
                {submitting ? "Saving..." : submitLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
