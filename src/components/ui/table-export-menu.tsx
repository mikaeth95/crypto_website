import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { exportTableRows, type TableExportConfig, type TableExportFormat } from "../../lib/tableExport";
import { cn } from "../../lib/utils";

export const TableExportMenu = <T,>({
  rows,
  config,
}: {
  rows: T[];
  config: TableExportConfig<T>;
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const handleExport = (format: TableExportFormat) => {
    exportTableRows(rows, config, format);
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn("button-surface h-10 px-3 text-xs text-slate-300", open && "border-slate-500/70 bg-[#161d26]")}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={rows.length === 0}
      >
        <Download size={14} />
        Export
        <ChevronDown size={13} className={cn("text-slate-500 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-border/90 bg-panel p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.48)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("xlsx")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.04] hover:text-slate-100"
          >
            <FileSpreadsheet size={15} />
            Export Excel
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExport("csv")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.04] hover:text-slate-100"
          >
            <FileText size={15} />
            Export CSV
          </button>
        </div>
      ) : null}
    </div>
  );
};
