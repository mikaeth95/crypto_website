import {
  BarChart3,
  Briefcase,
  ChevronDown,
  History,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  ReceiptText,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useUserData } from "../../hooks/useUserData";
import { cn } from "../../lib/utils";

const primaryItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/trade-history", label: "Trade History", icon: History },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
];

const baseSecondaryItems = [
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/markets", label: "Markets", icon: Search },
  { to: "/live-charts", label: "Charts", icon: TrendingUp },
];

// Nur für Administratoren sichtbar. Das Ausblenden ist reine Bedienerführung:
// Wer /admin direkt aufruft, wird von ProtectedRoute umgeleitet, und die
// Datenbank liefert Nicht-Administratoren ohnehin keine Daten (is_admin()).
const adminItem = { to: "/admin", label: "Administration", icon: ShieldCheck };

const isPathActive = (pathname: string, target: string) =>
  target === "/dashboard" ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);

const desktopLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative inline-flex h-16 items-center gap-2 px-0.5 text-sm font-normal text-slate-500 transition-colors hover:text-slate-300",
    isActive &&
      "font-semibold text-slate-50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-accent/70",
  );

const menuLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 px-3 py-2.5 text-sm font-normal text-slate-400 transition-colors hover:text-slate-200",
    isActive && "font-semibold text-slate-50",
  );

export const AppNavigation = () => {
  const location = useLocation();
  const navigationRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { isAdmin } = useUserData();
  const secondaryItems = useMemo(
    () => (isAdmin ? [...baseSecondaryItems, adminItem] : baseSecondaryItems),
    [isAdmin],
  );
  const allItems = useMemo(() => [...primaryItems, ...secondaryItems], [secondaryItems]);
  const hasSecondaryActiveItem = secondaryItems.some((item) => isPathActive(location.pathname, item.to));

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) {
        setMobileOpen(false);
        setMoreOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setMoreOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div
      ref={navigationRef}
      className="relative ml-auto flex items-center md:absolute md:left-1/2 md:ml-0 md:-translate-x-1/2"
    >
      <nav className="hidden items-center gap-4 md:flex xl:gap-5 2xl:gap-7" aria-label="Primary navigation">
        {primaryItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/dashboard"} className={desktopLinkClassName}>
            <item.icon size={14} className="shrink-0" />
            {item.label}
          </NavLink>
        ))}

        <div className="hidden xl:contents">
          {secondaryItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={desktopLinkClassName}>
              <item.icon size={14} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="relative xl:hidden">
          <button
            type="button"
            onClick={() => setMoreOpen((current) => !current)}
            className={cn(
              "relative inline-flex h-16 items-center gap-1.5 px-0.5 text-sm font-normal text-slate-500 transition-colors hover:text-slate-300",
              hasSecondaryActiveItem &&
                "font-semibold text-slate-50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-accent/70",
            )}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <MoreHorizontal size={15} />
            More
            <ChevronDown size={13} className={cn("transition", moreOpen && "rotate-180")} />
          </button>

          {moreOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-border/90 bg-panel p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.48)]">
              {secondaryItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={menuLinkClassName}>
                  <item.icon size={15} className="shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      </nav>

      <button
        type="button"
        onClick={() => setMobileOpen((current) => !current)}
        className="button-surface h-9 px-2.5 md:hidden"
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X size={17} /> : <Menu size={17} />}
        <span className="hidden sm:inline">Menu</span>
      </button>

      {mobileOpen ? (
        <nav
          className="fixed inset-x-3 top-[4.5rem] z-50 rounded-xl border border-border/90 bg-panel p-2 shadow-[0_18px_44px_rgba(0,0,0,0.5)] md:hidden"
          aria-label="Mobile navigation"
        >
          {allItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/dashboard"} className={menuLinkClassName}>
              <item.icon size={15} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
};
