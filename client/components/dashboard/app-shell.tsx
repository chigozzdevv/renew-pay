"use client";

import type { ReactNode } from "react";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardAccessGate } from "@/components/dashboard/access-gate";
import { ModeProvider } from "@/components/dashboard/mode-provider";
import { DashboardSessionProvider } from "@/components/dashboard/session-provider";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { cn } from "@/lib/utils";

type DashboardAppShellProps = {
  children: ReactNode;
};

export function DashboardAppShell({ children }: DashboardAppShellProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  return (
    <DashboardSessionProvider>
      <ModeProvider>
        <div className="min-h-screen bg-white text-[color:var(--ink)]">
          <div className="flex min-h-screen">
            <aside className="sticky top-0 hidden h-screen w-[288px] shrink-0 lg:block">
              <DashboardSidebar pathname={pathname} />
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <DashboardTopbar onOpenSidebar={() => setIsSidebarOpen(true)} />
              <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
                <DashboardAccessGate>
                  {children}
                </DashboardAccessGate>
              </main>
            </div>
          </div>

          <div
            className={cn(
              "fixed inset-0 z-50 lg:hidden",
              isSidebarOpen ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            <button
              type="button"
              aria-label="Close dashboard navigation"
              onClick={() => setIsSidebarOpen(false)}
              className={cn(
                "absolute inset-0 bg-[#121312]/32 transition-opacity duration-200",
                isSidebarOpen ? "opacity-100" : "opacity-0",
              )}
            />

            <div
              className={cn(
                "absolute inset-y-0 left-0 w-[86vw] max-w-[320px] p-3 transition-transform duration-300 ease-out",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <DashboardSidebar
                pathname={pathname}
                mobile
                onNavigate={() => setIsSidebarOpen(false)}
              />
            </div>
          </div>
        </div>
      </ModeProvider>
    </DashboardSessionProvider>
  );
}
