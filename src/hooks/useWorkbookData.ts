import { useEffect, useMemo, useState } from "react";
import { WORKBOOK_PATH } from "../lib/constants";
import { loadWorkbookData } from "../lib/excel";
import { byAssetLookup, dashboardDerived } from "../lib/calculations";
import type { WorkbookData } from "../types/portfolio";

export const useWorkbookData = () => {
  const [data, setData] = useState<WorkbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const parsed = await loadWorkbookData(WORKBOOK_PATH);
        setData(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown parser error");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const lookup = useMemo(() => {
    if (!data) return {};
    return byAssetLookup(data.assets, data.performance, data.transactions);
  }, [data]);

  const derived = useMemo(() => {
    if (!data) return null;
    return dashboardDerived(data.assets, data.transactions);
  }, [data]);

  return { data, loading, error, lookup, derived };
};
