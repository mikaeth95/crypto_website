/**
 * Zeilentypen der Supabase-Datenbank.
 *
 * Zweck:
 *   Bildet jede Tabelle des Schemas (Stand nach 01_dritte_normalform.sql und
 *   02_benutzerrollen.sql) als TypeScript-Typ ab, damit der Compiler jede Stelle
 *   meldet, die noch eine entfernte Spalte liest oder schreibt.
 *
 * Eingaben:
 *   Keine. Reine Typdefinitionen.
 *
 * Ausgaben:
 *   Ein Typ je Tabelle bzw. je RPC-Ergebnis.
 *
 * Annahmen:
 *   - Eigentum wird nur noch an zwei Stellen gespeichert: represented_accounts.owner_user_id
 *     und user_preferences.owner_user_id. Alle anderen Tabellen hängen über das
 *     Börsenkonto (represented_account_id) am Benutzer.
 *   - Die Plattform einer Transaktion bzw. Importdatei ergibt sich aus
 *     represented_accounts.provider und wird nicht mehr je Zeile gespeichert.
 *   - Zahlen aus double-precision-Spalten können von PostgREST als number oder
 *     string kommen; die Kontexte normalisieren sie beim Einlesen.
 */
import type { ChartTimeframe } from "./market";

/** Benutzertyp. Die Datenbank kennt genau diese zwei Werte (enum public.user_role). */
export type UserRole = "user" | "admin";

export interface ProfileRecord {
  id: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface RepresentedAccountRecord {
  id: string;
  owner_user_id: string;
  name: string;
  provider: string;
  base_currency: string | null;
  created_at: string;
  updated_at: string;
}

/** Kopf einer Chart-Zusammenstellung. Die Handelspaare liegen in live_chart_preset_assets. */
export interface LiveChartPresetRecord {
  id: string;
  represented_account_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** Ein Handelspaar an einer festen Position (1 bis 4) innerhalb einer Zusammenstellung. */
export interface LiveChartPresetAssetRecord {
  preset_id: string;
  position: number;
  instrument: string;
}

export interface UserPreferencesRecord {
  owner_user_id: string;
  selected_preset_id: string | null;
  selected_timeframe: ChartTimeframe | string | null;
  selected_represented_account_id: string | null;
  updated_at: string;
}

export interface ImportedTransactionRecord {
  id: string;
  represented_account_id: string;
  /** Importdatei, aus der die Transaktion zuerst übernommen wurde. Null bei Altbestand ohne Zuordnung. */
  import_file_id: string | null;
  external_id: string;
  occurred_at: string;
  transaction_type: string;
  asset: string;
  quote: string | null;
  quantity: number | string | null;
  execution_price: number | string | null;
  gross_value: number | string | null;
  fee: number | string | null;
  fee_currency: string | null;
  net_quantity: number | string | null;
  net_value: number | string | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
}

export interface ImportHistoryFileRecord {
  id: string;
  represented_account_id: string;
  stored_file_name: string;
  original_file_name: string | null;
  storage_bucket: string;
  storage_path: string;
  content_type: string | null;
  file_size_bytes: number | string;
  imported_at: string;
  created_at: string;
  updated_at: string;
}

/** Eine Zeile aus der RPC-Funktion admin_user_overview(). Enthält nur Zählwerte, keine Beträge. */
export interface AdminUserOverviewRecord {
  id: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
  account_count: number;
  transaction_count: number;
  last_import: string | null;
}
