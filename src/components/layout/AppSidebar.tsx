import { BarChart3, Briefcase, LayoutDashboard, ReceiptText, Search, TrendingUp } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
  { to: "/performance", label: "Coin Performance", icon: BarChart3 },
  { to: "/markets", label: "Markets", icon: Search },
  { to: "/live-charts", label: "Live Charts", icon: TrendingUp },
];

export const AppSidebar = () => {
  return (
    <aside className="w-full border-b border-border/80 bg-[#0e1319] px-3 py-3 md:sticky md:top-0 md:self-start md:h-screen md:w-72 md:min-w-72 md:max-w-72 md:shrink-0 md:border-b-0 md:border-r md:px-3 md:py-4">
      <div className="mb-5 rounded-[20px] border border-border/80 bg-panel px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 font-mono text-sm font-semibold tracking-[0.18em] text-slate-100">
            CP
          </div>
          <div className="min-w-0">
            <p className="terminal-label text-[#9ab1ff]">Private Workspace</p>
            <h1 className="mt-2 text-base font-semibold tracking-[-0.02em] text-slate-50">
              Crypto Portfolio Dashboard
            </h1>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Portfolio intelligence, market monitoring, and live chart layouts in one operator console.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
          <div className="rounded-lg border border-border/70 bg-panelSoft px-3 py-2">
            <p className="terminal-label">Mode</p>
            <p className="mt-1 font-mono text-xs text-slate-200">Private</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-panelSoft px-3 py-2">
            <p className="terminal-label">Feed</p>
            <p className="mt-1 font-mono text-xs text-slate-200">Live</p>
          </div>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/dashboard"}
            className={({ isActive }) =>
              cn(
                "group relative flex w-full items-center gap-3 rounded-[14px] border border-transparent px-3 py-3 text-sm font-medium text-slate-300 transition hover:border-border/80 hover:bg-[#141b23] hover:text-white",
                isActive &&
                  "border-border bg-[#151d27] text-slate-50 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-accent",
              )
            }
          >
            <Icon size={16} className="text-slate-500 transition group-hover:text-slate-200" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
