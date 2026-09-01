import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { AppDataProvider } from "./context/AppDataContext";
import { Card } from "./components/ui/card";
import { PageHeader } from "./components/ui/page-header";
import { UserDataProvider } from "./context/UserDataContext";
import { useAppData } from "./hooks/useAppData";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { LiveChartsPage } from "./pages/LiveChartsPage";
import { MarketsPage } from "./pages/MarketsPage";
import { PerformancePage } from "./pages/PerformancePage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { TradeHistoryPage } from "./pages/TradeHistoryPage";

const ProtectedDashboardRoutes = () => {
  const { data, loading, error } = useAppData();

  return (
    <DashboardLayout>
      {loading ? (
        <Card className="mb-4 animate-pulse">
          <PageHeader title="Loading Data" description="Loading imported transactions and rebuilding dashboard views..." />
        </Card>
      ) : null}

      {error ? <Card className="mb-4 text-neg">Failed to load imported data: {error}</Card> : null}

      {data.errors.length ? (
        <Card className="mb-4">
          <p className="mb-2 font-semibold text-orange-300">Data validation warnings</p>
          <ul className="list-disc pl-4 text-sm text-orange-200">
            {data.errors.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Routes>
        <Route path="/dashboard" element={<DashboardPage data={data} />} />
        <Route path="/portfolio" element={<PortfolioPage data={data} />} />
        <Route path="/trade-history" element={<TradeHistoryPage data={data} />} />
        <Route path="/transactions" element={<TransactionsPage data={data} />} />
        <Route path="/performance" element={<PerformancePage data={data} />} />
        <Route path="/markets" element={<MarketsPage updatedAt={data.loadedAt} />} />
        <Route path="/live-charts" element={<LiveChartsPage data={data} />} />
        <Route path="/live-charts/markets/:marketSymbol" element={<LiveChartsPage data={data} />} />
        <Route path="/live-charts/preset/:presetTabName/:presetSlug" element={<LiveChartsPage data={data} />} />
        <Route path="/live-charts/:presetSlug" element={<LiveChartsPage data={data} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

const ProtectedDashboardApp = () => (
  <UserDataProvider>
    <AppDataProvider>
      <ProtectedDashboardRoutes />
    </AppDataProvider>
  </UserDataProvider>
);

const App = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/*" element={<ProtectedDashboardApp />} />
    </Route>
  </Routes>
);

export default App;
