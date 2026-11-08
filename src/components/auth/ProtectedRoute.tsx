/**
 * Routenschutz der Oberfläche.
 *
 * Zweck:
 *   Leitet nicht angemeldete Besucher auf die Startseite um. Mit requiredRole
 *   prüft die Route zusätzlich die Rolle des Benutzers (z. B. "admin" für /admin).
 *
 * Eingaben:
 *   - Sitzung aus AuthContext.
 *   - Optional requiredRole; dann wird die Rolle aus UserDataContext gelesen.
 *
 * Ausgaben:
 *   Die geschützten Unterrouten (Outlet) oder eine Umleitung.
 *
 * Annahmen:
 *   - WICHTIG: Diese Prüfung ist nur Bedienerführung. Sie verhindert, dass
 *     jemand eine Seite sieht, mit der er nichts anfangen kann. Sie ist KEIN
 *     Schutz: Der Code läuft im Browser und lässt sich umgehen. Geschützt
 *     werden die Daten ausschließlich durch die Row-Level-Security-Regeln und
 *     die security-definer-Funktionen in der Datenbank (is_admin,
 *     admin_user_overview, protect_role).
 *   - Eine Route mit requiredRole muss innerhalb von UserDataProvider liegen.
 */
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useUserData } from "../../hooks/useUserData";
import type { UserRole } from "../../types/supabase";
import { Card } from "../ui/card";

const AuthLoadingView = ({ title, description }: { title: string; description: string }) => (
  <div className="flex min-h-screen items-center justify-center px-4">
    <Card className="w-full max-w-md text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Authentication
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </Card>
  </div>
);

/**
 * Rollenprüfung als eigene Komponente, damit useUserData nur dort aufgerufen
 * wird, wo eine Rolle verlangt ist (Hook-Regeln, Provider-Verfügbarkeit).
 */
const RequireRole = ({ role }: { role: UserRole }) => {
  const { loading, role: currentRole } = useUserData();

  if (loading) {
    return (
      <AuthLoadingView
        title="Checking permissions"
        description="Loading your profile before opening this area."
      />
    );
  }

  // Bedienerführung: Wer die Rolle nicht hat, landet auf dem Dashboard.
  // Selbst wenn diese Prüfung umgangen wird, liefert die Datenbank keine Daten.
  if (currentRole !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export const ProtectedRoute = ({ requiredRole }: { requiredRole?: UserRole } = {}) => {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <AuthLoadingView
        title="Restoring your session"
        description="Checking the current Supabase session before loading protected dashboard routes."
      />
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return requiredRole ? <RequireRole role={requiredRole} /> : <Outlet />;
};
