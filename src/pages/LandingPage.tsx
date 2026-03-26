import { useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LogIn, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { LoginForm } from "../components/auth/LoginForm";
import { SignupForm } from "../components/auth/SignupForm";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../hooks/useAuth";

type AuthMode = "login" | "signup";

const modeButtonClassName = (active: boolean) =>
  `inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition ${
    active
      ? "border-accent/35 bg-accent/10 text-[#c2d1ff]"
      : "border-border/80 bg-panelSoft/70 text-slate-300 hover:border-slate-500/70 hover:bg-[#151c25] hover:text-white"
  }`;

const resolveRedirectTarget = (state: unknown): string => {
  if (
    state &&
    typeof state === "object" &&
    "from" in state &&
    state.from &&
    typeof state.from === "object" &&
    "pathname" in state.from &&
    typeof state.from.pathname === "string" &&
    state.from.pathname !== "/"
  ) {
    return state.from.pathname as string;
  }

  return "/dashboard";
};

export const LandingPage = () => {
  const { authError, isConfigured, loading, user } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>("login");
  const redirectTarget = useMemo(() => resolveRedirectTarget(location.state), [location.state]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Session
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">
            Preparing your workspace
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Loading the current auth state before choosing the public landing page or the protected app.
          </p>
        </Card>
      </div>
    );
  }

  if (user) {
    return <Navigate to={redirectTarget} replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 md:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(79,124,255,0.1),transparent_24%)]" />

      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-6 lg:grid-cols-[1.15fr_460px] lg:items-center">
        <section className="space-y-6">
          <Badge tone="blue">Private Workspace Access</Badge>
          <div className="space-y-4">
            <p className="terminal-label text-[#9ab1ff]">
              Crypto Portfolio Dashboard
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-50 md:text-5xl">
              Operator-grade portfolio analytics, live chart monitoring, and private preset workflows.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              Monitor workbook-backed portfolio performance, keep live chart layouts synced per user, and lock the
              entire dashboard behind Supabase authentication and Row Level Security.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className={modeButtonClassName(mode === "login")} onClick={() => setMode("login")}>
              <LogIn size={16} />
              Login
            </button>
            <button
              type="button"
              className={modeButtonClassName(mode === "signup")}
              onClick={() => setMode("signup")}
            >
              <UserPlus size={16} />
              Sign Up
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5">
              <ShieldCheck size={18} className="text-emerald-300" />
              <h2 className="mt-4 text-base font-semibold text-slate-100">Protected App Area</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                All dashboard routes are gated. Unauthenticated visits are redirected back to this landing page.
              </p>
            </Card>

            <Card className="p-5">
              <Sparkles size={18} className="text-[#9ab1ff]" />
              <h2 className="mt-4 text-base font-semibold text-slate-100">Per-User Presets</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Live chart presets, timeframe preferences, and represented-account context are stored against the
                signed-in user.
              </p>
            </Card>

            <Card className="p-5">
              <LogIn size={18} className="text-slate-300" />
              <h2 className="mt-4 text-base font-semibold text-slate-100">Persistent Sessions</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Supabase restores sessions across reloads and updates the app immediately when auth state changes.
              </p>
            </Card>
          </div>
        </section>

        <Card className="p-6 md:p-7">
          <div className="mb-6">
            <p className="terminal-label">Access</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
              {mode === "login" ? "Continue to dashboard" : "Create your account"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {mode === "login"
                ? "Sign in with your email and password to open the protected dashboard area."
                : "Create an account to get your own saved presets, preferences, and account context."}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 rounded-[18px] border border-border/80 bg-panelSoft/70 p-1">
            <button type="button" className={modeButtonClassName(mode === "login")} onClick={() => setMode("login")}>
              Login
            </button>
            <button
              type="button"
              className={modeButtonClassName(mode === "signup")}
              onClick={() => setMode("signup")}
            >
              Sign Up
            </button>
          </div>

          {!isConfigured ? (
            <p className="mb-4 rounded-xl border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
              Supabase environment variables are missing. Add `VITE_SUPABASE_URL` and
              `VITE_SUPABASE_PUBLISHABLE_KEY` before using auth.
            </p>
          ) : null}

          {authError ? (
            <p className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {authError}
            </p>
          ) : null}

          {mode === "login" ? <LoginForm /> : <SignupForm />}
        </Card>
      </div>
    </div>
  );
};
