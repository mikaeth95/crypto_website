import type { InputHTMLAttributes, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, X } from "lucide-react";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";

export type MarketFilterPreset =
  | "BIG_COINS_ONLY"
  | "BIG_AND_MEDIUM_COINS"
  | "BIG_AND_MEDIUM_NO_BIG_MEMECOINS";

interface MarketFiltersModalProps {
  open: boolean;
  activeFilterCount: number;
  selectedPreset: MarketFilterPreset | null;
  minLastPriceValue: string;
  maxLastPriceValue: string;
  minChange24hValue: string;
  maxChange24hValue: string;
  minVolume24hValue: string;
  maxVolume24hValue: string;
  onPresetChange: (preset: MarketFilterPreset | null) => void;
  onClose: () => void;
  onMinLastPriceChange: (value: string) => void;
  onMaxLastPriceChange: (value: string) => void;
  onMinChange24hChange: (value: string) => void;
  onMaxChange24hChange: (value: string) => void;
  onMinVolume24hChange: (value: string) => void;
  onMaxVolume24hChange: (value: string) => void;
}

const FilterSection = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-[18px] border border-border/80 bg-panelSoft/55 p-4">
    <div className="mb-4 border-b border-border/70 pb-3">
      <p className="terminal-label">{eyebrow}</p>
      <h3 className="mt-2 text-base font-semibold tracking-tight text-slate-100">{title}</h3>
    </div>
    <div className="grid gap-3">{children}</div>
  </section>
);

const FilterField = ({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
}) => (
  <label className="space-y-2">
    <span className="text-sm font-medium text-slate-200">{label}</span>
    <Input {...props} />
  </label>
);

const PRESET_OPTIONS: Array<{
  id: MarketFilterPreset;
  label: string;
  hint: string;
}> = [
  {
    id: "BIG_COINS_ONLY",
    label: "Big Coins",
    hint: "Min price 1, min 24H volume 100,000.",
  },
  {
    id: "BIG_AND_MEDIUM_COINS",
    label: "Big + Medium",
    hint: "Min price 0.10, min 24H volume 25,000.",
  },
  {
    id: "BIG_AND_MEDIUM_NO_BIG_MEMECOINS",
    label: "No Big Memecoins",
    hint: "Min price 0.01, min 24H volume 10,000.",
  },
];

const presetButtonClassName = (active: boolean) =>
  active
    ? "rounded-[14px] border border-accent/35 bg-accent/10 px-3 py-3 text-left text-slate-100 transition"
    : "rounded-[14px] border border-border/80 bg-panelSoft/60 px-3 py-3 text-left text-slate-300 transition hover:border-slate-500/70 hover:bg-[#151c25] hover:text-white";

export const MarketFiltersModal = ({
  open,
  activeFilterCount,
  selectedPreset,
  minLastPriceValue,
  maxLastPriceValue,
  minChange24hValue,
  maxChange24hValue,
  minVolume24hValue,
  maxVolume24hValue,
  onPresetChange,
  onClose,
  onMinLastPriceChange,
  onMaxLastPriceChange,
  onMinChange24hChange,
  onMaxChange24hChange,
  onMinVolume24hChange,
  onMaxVolume24hChange,
}: MarketFiltersModalProps) => (
  <AnimatePresence>
    {open ? (
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0.96, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", damping: 24, stiffness: 220 }}
          className="w-full max-w-4xl rounded-[22px] border border-border/90 bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.44)]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Market filters"
        >
          <div className="border-b border-border/80 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-accent/25 bg-accent/10 text-[#c2d1ff]">
                    <Filter size={16} />
                  </div>
                  <div>
                    <p className="terminal-label text-[#9ab1ff]">Markets</p>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-100">Advanced Filters</h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm text-slate-400">
                  Refine the market table by last price, 24H change, and 24H quoted volume. Filters apply live as you type.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {activeFilterCount > 0 ? <Badge tone="blue">{activeFilterCount} Active</Badge> : null}
                <button
                  type="button"
                  className="button-surface p-2"
                  onClick={onClose}
                  aria-label="Close market filters"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-5 py-5 sm:px-6 xl:grid-cols-3">
            <section className="xl:col-span-3 rounded-[18px] border border-border/80 bg-panelSoft/55 p-4">
              <div className="mb-4 border-b border-border/70 pb-3">
                <p className="terminal-label">Universe</p>
                <h3 className="mt-2 text-base font-semibold tracking-tight text-slate-100">Filter Presets</h3>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={presetButtonClassName(selectedPreset === preset.id)}
                    onClick={() => onPresetChange(selectedPreset === preset.id ? null : preset.id)}
                    aria-pressed={selectedPreset === preset.id}
                  >
                    <p className="text-sm font-semibold">{preset.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{preset.hint}</p>
                  </button>
                ))}
              </div>
            </section>

            <FilterSection eyebrow="Price" title="Last Price Range">
              <FilterField
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={minLastPriceValue}
                onChange={(event) => onMinLastPriceChange(event.target.value)}
                placeholder="Set minimum"
                aria-label="Minimum last price"
                label="Min last price"
              />
              <FilterField
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={maxLastPriceValue}
                onChange={(event) => onMaxLastPriceChange(event.target.value)}
                placeholder="Set maximum"
                aria-label="Maximum last price"
                label="Max last price"
              />
            </FilterSection>

            <FilterSection eyebrow="Momentum" title="24H Change %">
              <FilterField
                type="number"
                inputMode="decimal"
                step="any"
                value={minChange24hValue}
                onChange={(event) => onMinChange24hChange(event.target.value)}
                placeholder="e.g. -5"
                aria-label="Minimum 24 hour change percent"
                label="Min change"
              />
              <FilterField
                type="number"
                inputMode="decimal"
                step="any"
                value={maxChange24hValue}
                onChange={(event) => onMaxChange24hChange(event.target.value)}
                placeholder="e.g. 10"
                aria-label="Maximum 24 hour change percent"
                label="Max change"
              />
            </FilterSection>

            <FilterSection eyebrow="Flow" title="24H Volume">
              <FilterField
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={minVolume24hValue}
                onChange={(event) => onMinVolume24hChange(event.target.value)}
                placeholder="Set minimum"
                aria-label="Minimum 24 hour volume"
                label="Min volume"
              />
              <FilterField
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={maxVolume24hValue}
                onChange={(event) => onMaxVolume24hChange(event.target.value)}
                placeholder="Set maximum"
                aria-label="Maximum 24 hour volume"
                label="Max volume"
              />
            </FilterSection>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-slate-500">
              The market table updates immediately as filter values change.
            </p>
            <button type="button" className="button-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);
