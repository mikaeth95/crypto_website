import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Card } from "../ui/card";

const AuthLoadingView = () => (
  <div className="flex min-h-screen items-center justify-center px-4">
    <Card className="w-full max-w-md text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Authentication
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">
        Restoring your session
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Checking the current Supabase session before loading protected dashboard routes.
      </p>
    </Card>
  </div>
);

export const ProtectedRoute = () => {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingView />;
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
};
