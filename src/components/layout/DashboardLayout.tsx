import type { PropsWithChildren } from "react";
import type { WorkbookData } from "../../types/portfolio";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

export const DashboardLayout = ({
  children,
  data,
}: PropsWithChildren<{ data: WorkbookData | null }>) => (
  <div className="min-h-screen bg-bg md:flex">
    <AppSidebar />
    <main className="relative w-full px-3 pb-6 pt-3 md:px-4 lg:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(79,124,255,0.08),transparent_24%)]" />
      <AppHeader data={data} />
      <div className="w-full">{children}</div>
    </main>
  </div>
);
