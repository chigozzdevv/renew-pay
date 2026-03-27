"use client";

import type { ReactNode } from "react";

import { OnboardingSurface } from "@/components/dashboard/onboarding-surface";
import { useDashboardSession } from "@/components/dashboard/session-provider";

export function DashboardWorkspaceAccessBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useDashboardSession();

  if (user?.onboardingStatus !== "workspace_active") {
    return <OnboardingSurface />;
  }

  return <>{children}</>;
}
