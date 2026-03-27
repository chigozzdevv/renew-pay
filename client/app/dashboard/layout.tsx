import type { ReactNode } from "react";

import { DashboardAppShell } from "@/components/dashboard/app-shell";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <DashboardAppShell>{children}</DashboardAppShell>;
}
