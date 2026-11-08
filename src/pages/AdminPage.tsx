/**
 * Administrationsbereich (/admin).
 *
 * Zweck:
 *   Zeigt Administratoren eine Benutzerübersicht und erlaubt, die Rolle eines
 *   Benutzers zwischen "user" und "admin" umzustellen.
 *
 * Eingaben:
 *   - RPC admin_user_overview(): je Benutzer Anzeigename, Rolle,
 *     Registrierungsdatum und reine Zählwerte (Börsenkonten, Transaktionen,
 *     Zeitpunkt des letzten Imports).
 *   - Tabelle profiles für das Umstellen der Rolle.
 *
 * Ausgaben:
 *   Tabelle mit einer Rollenauswahl je Zeile und verständlichen Fehlermeldungen.
 *
 * Annahmen:
 *   - Datenschutz: Der Administrator sieht bewusst keine fremden Transaktionen,
 *     Importdateien, Beträge oder Bestände. Die RPC-Funktion liefert nur
 *     Zählwerte; eine Ansicht auf fremde Detaildaten gibt es nicht und soll es
 *     nicht geben.
 *   - Schutz: Menüpunkt und Routenprüfung sind nur Bedienerführung. Ob jemand
 *     Administrator ist, prüft die Datenbank selbst: admin_user_overview()
 *     liefert für Nicht-Administratoren eine leere Liste, das Ändern der Rolle
 *     erlauben nur die Regel profiles_update_admin und der Trigger protect_role.
 *   - Der Trigger verhindert, dass der letzte Administrator herabgestuft wird.
 */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { PageHeader } from "../components/ui/page-header";
import { useAuth } from "../hooks/useAuth";
import { useUserData } from "../hooks/useUserData";
import { supabase } from "../lib/supabase";
import type { AdminUserOverviewRecord, UserRole } from "../types/supabase";

const USER_ROLES: UserRole[] = ["user", "admin"];

const parseCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) ? parsed : 0;
};

/** Prüft eine Zeile aus admin_user_overview(). bigint-Zählwerte können als string kommen. */
const sanitiseOverviewRow = (value: unknown): AdminUserOverviewRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.id !== "string" || typeof candidate.created_at !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    display_name: typeof candidate.display_name === "string" ? candidate.display_name : null,
    role: candidate.role === "admin" ? "admin" : "user",
    created_at: candidate.created_at,
    account_count: parseCount(candidate.account_count),
    transaction_count: parseCount(candidate.transaction_count),
    last_import: typeof candidate.last_import === "string" ? candidate.last_import : null,
  };
};

/**
 * Übersetzt Fehler aus der Datenbank in verständliche Meldungen. Die Texte
 * stammen aus dem Trigger protect_role (02_benutzerrollen.sql).
 */
const describeRoleChangeError = (message: string): string => {
  if (message.includes("letzte Administrator")) {
    return "The last administrator cannot be demoted. Promote another user to admin first.";
  }

  if (message.includes("Nur ein Administrator")) {
    return "Only administrators can change roles. Your session may no longer have admin rights.";
  }

  return `The role could not be changed: ${message}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

const formatDate = (value: string) => {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
};

export const AdminPage = () => {
  const { user } = useAuth();
  const { refreshUserData } = useUserData();
  const [rows, setRows] = useState<AdminUserOverviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!supabase) {
      setLoadError("Supabase is not available right now.");
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.rpc("admin_user_overview");

    if (error) {
      setLoadError(`The user overview could not be loaded: ${error.message}`);
      setRows([]);
    } else {
      setLoadError(null);
      setRows(
        (Array.isArray(data) ? data : [])
          .map((row) => sanitiseOverviewRow(row))
          .filter((row): row is AdminUserOverviewRecord => row !== null),
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleRoleChange = async (target: AdminUserOverviewRecord, nextRole: UserRole) => {
    if (!supabase || nextRole === target.role) {
      return;
    }

    const isSelf = target.id === user?.id;

    if (
      isSelf &&
      nextRole === "user" &&
      typeof window !== "undefined" &&
      !window.confirm("You are removing your own admin rights. You will lose access to this page. Continue?")
    ) {
      return;
    }

    setActionError(null);
    setSavingUserId(target.id);

    // Ob die Änderung erlaubt ist, entscheidet die Datenbank (Regel und Trigger).
    // select() liefert die geänderte Zeile zurück; eine leere Antwort heißt,
    // dass die Zugriffsregeln die Änderung nicht zugelassen haben.
    const { data, error } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", target.id)
      .select("id, role");

    setSavingUserId(null);

    if (error) {
      setActionError(describeRoleChangeError(error.message));
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      setActionError("The role could not be changed. You may not have the required permissions.");
      return;
    }

    if (isSelf) {
      // Eigene Rolle geändert: Profil neu laden, damit Menü und Routenprüfung stimmen.
      await refreshUserData();
      return;
    }

    await loadOverview();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration"
        description="Registered users and their roles. Only counts are shown; transactions, import files and holdings of other users are not visible here."
      />

      {loadError ? <Card className="text-sm text-rose-300">{loadError}</Card> : null}
      {actionError ? (
        <Card className="border-rose-400/30 text-sm text-rose-200">
          <p role="alert">{actionError}</p>
        </Card>
      ) : null}

      <Card className="p-0">
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-400">Loading users…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border/80 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Display name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                  <th className="px-4 py-3 text-right font-medium">Accounts</th>
                  <th className="px-4 py-3 text-right font-medium">Transactions</th>
                  <th className="px-4 py-3 font-medium">Last import</th>
                  <th className="px-4 py-3 font-medium">Change role</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSaving = savingUserId === row.id;

                  return (
                    <tr key={row.id} className="border-b border-border/50 last:border-b-0">
                      <td className="px-4 py-3 text-slate-100">
                        {row.display_name?.trim() || <span className="text-slate-500">(no name)</span>}
                        {row.id === user?.id ? <span className="ml-2 text-xs text-slate-500">(you)</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={row.role === "admin" ? "blue" : "default"}>{row.role}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{row.account_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-300">{row.transaction_count}</td>
                      <td className="px-4 py-3 text-slate-300">{formatDateTime(row.last_import)}</td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-md border border-border/80 bg-panelSoft px-2 py-1 text-sm text-slate-200 disabled:opacity-50"
                          value={row.role}
                          disabled={isSaving}
                          aria-label={`Role of ${row.display_name ?? row.id}`}
                          onChange={(event) => void handleRoleChange(row, event.target.value as UserRole)}
                        >
                          {USER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
