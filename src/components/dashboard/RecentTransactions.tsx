import type { TransactionRow } from "../../types/portfolio";
import { Badge } from "../ui/badge";
import { ChartPanel } from "../ui/chart-panel";

const badgeTone = (type: string) => {
  if (type === "Einzahlung") return "blue";
  if (type === "Kauf") return "green";
  if (type === "Verkauf") return "orange";
  if (type === "Konvertierung") return "orange";
  if (type === "Auszahlung") return "red";
  return "default";
};

export const RecentTransactions = ({ transactions }: { transactions: TransactionRow[] }) => {
  const rows = [...transactions].slice(0, 10);
  return (
    <ChartPanel title="Recent Transactions" subtitle="Latest imported activity">
      <div className="space-y-2">
        {rows.map((tx) => (
          <div
            key={tx.transaktionId}
            className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-panelSoft/65 px-3 py-2.5 text-sm transition hover:border-slate-500/70 hover:bg-[#151c25] md:grid-cols-4"
          >
            <Badge tone={badgeTone(tx.typ)}>{tx.typ}</Badge>
            <span className="font-medium text-slate-100">{tx.asset}</span>
            <span className="tabular text-right text-slate-200">{tx.nettowert}</span>
            <span className="truncate text-right text-slate-400">{tx.datenquelle}</span>
          </div>
        ))}
      </div>
    </ChartPanel>
  );
};
