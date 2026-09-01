import type { PropsWithChildren } from "react";
import { AppHeader } from "./AppHeader";

export const DashboardLayout = ({
  children,
}: PropsWithChildren) => (
  <div className="min-h-screen bg-bg">
    <AppHeader />
    <main className="relative w-full px-3 pb-6 pt-4 md:px-5 lg:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(79,124,255,0.08),transparent_24%)]" />
      <div className="w-full">{children}</div>
    </main>
  </div>
);
