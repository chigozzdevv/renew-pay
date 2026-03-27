"use client";

import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { Badge, Button } from "@/components/dashboard/ui";


export function LiveOnboardingGate() {
  const { user } = useDashboardSession();
  const { isUpdating, setMode } = useWorkspaceMode();
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[2.4rem] border border-[#d3e4cf] bg-[radial-gradient(circle_at_top_left,_rgba(217,246,188,0.78),_rgba(244,247,241,0.96)_52%,_rgba(255,255,255,0.98)_100%)] p-6 shadow-[0_24px_80px_rgba(12,74,39,0.08)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl space-y-4">
            <Badge tone="warning">Live onboarding locked</Badge>
            <div className="space-y-3">
              <h1 className="font-display text-3xl font-semibold tracking-[-0.06em] text-[color:var(--ink)] sm:text-[2.6rem]">
                Live access opens after audit and mainnet deployment.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[color:var(--muted)] sm:text-[15px]">
                {firstName ? `${firstName}, ` : ""}
                your workspace will stay in test mode until Renew clears the live
                rollout checklist.
              </p>
              <p className="max-w-2xl text-sm leading-7 text-[color:var(--muted)] sm:text-[15px]">
                Live onboarding will open after the security audit and mainnet
                deployment are complete, followed by merchant KYB and operator
                KYC. Use test mode for billing work for now.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                tone="brand"
                disabled={isUpdating}
                onClick={() => void setMode("test")}
              >
                {isUpdating ? "Switching..." : "Switch to test mode"}
              </Button>
              <Button type="button" disabled className="min-w-[190px]">
                Start live onboarding
              </Button>
            </div>
          </div>

        </div>
      </div>

    </section>
  );
}
