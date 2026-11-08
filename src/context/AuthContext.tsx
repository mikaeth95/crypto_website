/**
 * Anmeldung und Sitzung.
 *
 * Zweck:
 *   Stellt die Supabase-Sitzung, den angemeldeten Benutzer sowie Anmelden,
 *   Registrieren und Abmelden für die ganze Anwendung bereit.
 *
 * Eingaben:
 *   Supabase Auth (E-Mail und Passwort), Anzeigename bei der Registrierung.
 *
 * Ausgaben:
 *   session, user, loading, authError und die Aktionen signIn, signUp, signOut.
 *
 * Annahmen:
 *   - Profil, Sammelkonto und Einstellungen eines neuen Benutzers legt der
 *     Datenbank-Trigger handle_new_user an, nicht das Frontend.
 *   - Passwortregeln setzt verbindlich Supabase Auth. Die Prüfung im Formular
 *     ist nur Bedienerführung.
 *   - Die Formulare geben Fehlermeldungen von Supabase bei der Anmeldung nicht
 *     weiter, damit sich nicht ableiten lässt, ob eine E-Mail registriert ist.
 */
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { createContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_MISSING_CONFIG_MESSAGE,
} from "../lib/supabase";

type SignInCredentials = {
  email: string;
  password: string;
};

type SignUpCredentials = {
  displayName: string;
  email: string;
  password: string;
};

type AuthResult = {
  error: AuthError | Error | null;
  needsEmailConfirmation?: boolean;
};

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  authError: string | null;
  isConfigured: boolean;
  signIn: (credentials: SignInCredentials) => Promise<AuthResult>;
  signUp: (credentials: SignUpCredentials) => Promise<AuthResult>;
  signOut: () => Promise<{ error: AuthError | Error | null }>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const supabaseClient = supabase;

    if (!supabaseClient || !isSupabaseConfigured) {
      setAuthError(SUPABASE_MISSING_CONFIG_MESSAGE);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const initialiseAuth = async () => {
      const { data, error } = await supabaseClient.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        setAuthError(error.message);
      } else {
        setAuthError(null);
      }

      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    void initialiseAuth();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async ({ email, password }: SignInCredentials): Promise<AuthResult> => {
    if (!supabase) {
      return { error: new Error(SUPABASE_MISSING_CONFIG_MESSAGE) };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error };
    }

    setAuthError(null);
    return { error: null };
  };

  const signUp = async ({
    displayName,
    email,
    password,
  }: SignUpCredentials): Promise<AuthResult> => {
    if (!supabase) {
      return { error: new Error(SUPABASE_MISSING_CONFIG_MESSAGE) };
    }

    const emailRedirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName.trim() || null,
        },
        emailRedirectTo,
      },
    });

    if (error) {
      return { error };
    }

    setAuthError(null);

    return {
      error: null,
      needsEmailConfirmation: Boolean(data.user && !data.session),
    };
  };

  const signOut = async () => {
    if (!supabase) {
      return { error: null };
    }

    const { error } = await supabase.auth.signOut();

    if (!error) {
      setAuthError(null);
    }

    return { error };
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      loading,
      authError,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [session, user, loading, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
