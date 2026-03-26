import { LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useUserData } from "../../hooks/useUserData";
import type { WorkbookData } from "../../types/portfolio";

const controlClassName =
  "control-surface min-w-[180px]";

const actionButtonClassName =
  "button-surface";

export const AppHeader = ({ data }: { data: WorkbookData | null }) => {
  const { profile, representedAccounts, selectedRepresentedAccountId, setSelectedRepresentedAccountId, loading } =
    useUserData();
  const { signOut, user } = useAuth();
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

  return (
    <header className="mb-8 flex flex-wrap items-center gap-3 rounded-[18px] border border-border/90 bg-panel/95 px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.28)] md:px-5">
      <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_220px]">
        <label className="rounded-[16px] border border-border/80 bg-panelSoft/85 px-3 py-3">
          <span className="terminal-label">Represented Account</span>
          <select
            value={selectedRepresentedAccountId ?? ""}
            onChange={(event) => void setSelectedRepresentedAccountId(event.target.value || null)}
            className={`${controlClassName} mt-2`}
            disabled={loading || representedAccounts.length === 0}
            aria-label="Select represented account"
          >
            {representedAccounts.length === 0 ? (
              <option value="">{loading ? "Loading accounts..." : "No accounts"}</option>
            ) : null}
            {representedAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-[16px] border border-border/80 bg-panelSoft/85 px-3 py-3 text-left">
          <p className="terminal-label">Last Refresh</p>
          <p className="tabular mt-2 text-sm font-medium text-slate-100">
            {data ? new Date(data.loadedAt).toLocaleString() : "n/a"}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3 rounded-[16px] border border-border/80 bg-panelSoft/85 px-3 py-3">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-100">{displayName}</p>
          <p className="text-xs text-slate-500">{user?.email ?? "n/a"}</p>
        </div>

        <button type="button" className={actionButtonClassName} onClick={() => void handleSignOut()} disabled={isSigningOut}>
          <LogOut size={14} />
          {isSigningOut ? "Signing Out..." : "Logout"}
        </button>
      </div>
    </header>
  );
};
