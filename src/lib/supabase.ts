/**
 * Supabase-Client und Startprüfung der Konfiguration.
 *
 * Zweck:
 *   Erzeugt den einzigen Supabase-Client der Anwendung und prüft vorher, ob
 *   die Verbindungseinstellungen vollständig und sicher sind.
 *
 * Eingaben:
 *   Vite-Umgebungsvariablen VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY.
 *
 * Ausgaben:
 *   - supabase: der Client oder null, wenn die Konfiguration fehlt oder ungültig ist.
 *   - isSupabaseConfigured / SUPABASE_MISSING_CONFIG_MESSAGE: bestehende Prüfung
 *     auf fehlende Werte (die Anwendung startet, zeigt aber den Hinweis an).
 *   - SUPABASE_STARTUP_ERROR: gesetzt, wenn die URL nicht mit https:// beginnt.
 *     main.tsx startet die Anwendung dann nicht, sondern zeigt nur die Meldung.
 *
 * Annahmen:
 *   - Zugangsdaten und Sitzungstoken dürfen nur verschlüsselt übertragen
 *     werden. Eine http-Adresse wird deshalb auch in der Entwicklung abgelehnt.
 *   - Der Publishable Key ist öffentlich. Er gewährt nur, was die
 *     Row-Level-Security-Regeln der Datenbank erlauben.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_MISSING_CONFIG_MESSAGE =
  "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your Vite environment variables.";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

const hasSecureUrl = Boolean(supabaseUrl?.trim().toLowerCase().startsWith("https://"));

/**
 * Fehlermeldung für den Startbildschirm. Nur gesetzt, wenn eine URL eingetragen
 * ist, die nicht mit https:// beginnt. Fehlende Werte behandelt weiterhin
 * SUPABASE_MISSING_CONFIG_MESSAGE.
 */
export const SUPABASE_STARTUP_ERROR: string | null =
  isSupabaseConfigured && !hasSecureUrl
    ? `The setting VITE_SUPABASE_URL is invalid: it must start with "https://" (current value: "${supabaseUrl}"). ` +
      "Correct the value in your .env file or in the Netlify environment variables and restart or redeploy the app."
    : null;

export const supabase =
  isSupabaseConfigured && hasSecureUrl && supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;
