import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { SUPABASE_STARTUP_ERROR } from "./lib/supabase";
import "./index.css";

/**
 * Startbildschirm bei ungültiger Konfiguration. Die Anwendung wird in diesem
 * Fall bewusst nicht gestartet, damit keine Anmeldedaten über eine
 * unverschlüsselte Verbindung gesendet werden.
 */
const StartupErrorScreen = ({ message }: { message: string }) => (
  <div className="flex min-h-screen items-center justify-center bg-bg px-4">
    <section className="w-full max-w-lg rounded-[18px] border border-rose-400/30 bg-panel p-6 text-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-300">Configuration error</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-50">The app cannot start</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
    </section>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {SUPABASE_STARTUP_ERROR ? (
      <StartupErrorScreen message={SUPABASE_STARTUP_ERROR} />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
);
