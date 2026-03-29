"use client";

import type { ReactNode } from "react";

import OnboardingPage from "@/app/dashboard/onboarding/page";
import { useDashboardSession } from "@/components/dashboard/session-provider";

export function DashboardAccessGate({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useDashboardSession();

  if (user?.onboardingStatus !== "workspace_active") {
    return (
      <>
        {children}
        <OnboardingPage />
      </>
    );
  }

  return <>{children}</>;
}
