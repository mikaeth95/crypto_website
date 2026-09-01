import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useUserData } from "../../hooks/useUserData";
import { isAllRepresentedAccount } from "../../lib/representedAccounts";
import { cn } from "../../lib/utils";
import { AppNavigation } from "./AppNavigation";

export const AppHeader = () => {
  const { profile, representedAccounts, selectedRepresentedAccountId, setSelectedRepresentedAccountId, loading } =
    useUserData();
  const { signOut, user } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  };

  const displayName =
    profile?.display_name?.trim() ||
    (typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "") ||
    user?.email?.split("@")[0] ||
    "User";
  const userInitials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  useEffect(() => {
    const closeUserMenu = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeUserMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeUserMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-[#0d1218]/95 shadow-[0_8px_24px_rgba(0,0,0,0.2)] backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-3 md:gap-3 md:px-5 lg:px-6">
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5" aria-label="Crypto Portfolio Dashboard">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 font-mono text-[11px] font-semibold tracking-[0.14em] text-slate-100">
            CP
          </span>
          <span className="hidden whitespace-nowrap text-sm font-semibold tracking-[-0.02em] text-slate-100 sm:block md:hidden lg:block">
            Crypto Portfolio
          </span>
        </Link>

        <AppNavigation />

        <div className="flex shrink-0 items-center gap-2 md:ml-auto">
          <label className="hidden shrink-0 lg:block">
          <span className="sr-only">Represented account</span>
          <select
            value={selectedRepresentedAccountId ?? ""}
            onChange={(event) => void setSelectedRepresentedAccountId(event.target.value || null)}
            className="h-9 max-w-44 rounded-lg border border-border/80 bg-panelSoft/75 px-2.5 text-xs font-medium text-slate-200 outline-none transition hover:border-slate-600 focus:border-accent/60"
            disabled={loading || representedAccounts.length === 0}
            aria-label="Select represented account"
          >
            {representedAccounts.length === 0 ? (
              <option value="">{loading ? "Loading accounts..." : "No accounts"}</option>
            ) : null}
            {representedAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {isAllRepresentedAccount(account) ? "All Accounts" : account.name}
              </option>
            ))}
          </select>
          </label>

          <div ref={userMenuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setUserMenuOpen((current) => !current)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-lg px-1.5 text-left text-slate-300 transition hover:bg-white/[0.035] hover:text-slate-100",
              userMenuOpen && "bg-white/[0.065] text-slate-50",
            )}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 font-mono text-[10px] font-semibold text-[#c7d4ff]">
              {userInitials}
            </span>
            <span className="hidden max-w-28 truncate text-xs font-medium text-slate-200 2xl:block">{displayName}</span>
            <ChevronDown
              size={13}
              className={cn("mr-0.5 text-slate-500 transition", userMenuOpen && "rotate-180")}
            />
          </button>

          {userMenuOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border/90 bg-panel p-2 shadow-[0_18px_44px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-3 border-b border-border/70 px-2 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-[#c7d4ff]">
                  <UserRound size={16} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email ?? "n/a"}</p>
                </div>
              </div>
              <label className="block border-b border-border/70 px-2 py-2.5 lg:hidden">
                <span className="terminal-label">Account</span>
                <select
                  value={selectedRepresentedAccountId ?? ""}
                  onChange={(event) => void setSelectedRepresentedAccountId(event.target.value || null)}
                  className="mt-2 h-9 w-full rounded-lg border border-border bg-panelSoft px-2.5 text-xs text-slate-200 outline-none focus:border-accent/60"
                  disabled={loading || representedAccounts.length === 0}
                  aria-label="Select represented account"
                >
                  {representedAccounts.length === 0 ? (
                    <option value="">{loading ? "Loading accounts..." : "No accounts"}</option>
                  ) : null}
                  {representedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {isAllRepresentedAccount(account) ? "All Accounts" : account.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
              >
                <LogOut size={15} />
                {isSigningOut ? "Signing Out..." : "Logout"}
              </button>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};
