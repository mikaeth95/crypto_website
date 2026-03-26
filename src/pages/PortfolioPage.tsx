import { PortfolioTable } from "../components/portfolio/PortfolioTable";
import { usePortfolioLiveData } from "../hooks/usePortfolioLiveData";
import type { WorkbookData } from "../types/portfolio";

export const PortfolioPage = ({ data }: { data: WorkbookData }) => {
  const { rows } = usePortfolioLiveData(data.assets);

  return (
    <PortfolioTable
      rows={rows}
      performance={data.performance}
      transactions={data.transactions}
    />
  );
};
