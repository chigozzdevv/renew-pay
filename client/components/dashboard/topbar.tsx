"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { useResource } from "@/components/dashboard/use-resource";
import { loadWorkspaceSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type DashboardTopbarProps = {
  onOpenSidebar: () => void;
};

const operationLabels: Record<string, string> = {
  payout_wallet_change_request: "Primary wallet change",
  payout_wallet_change_confirm: "Primary wallet confirmation",
  payout_batch_withdraw: "Payout batch withdrawal",
  reserve_wallet_update: "Reserve wallet update",
  reserve_wallet_clear: "Reserve wallet removal",
  reserve_wallet_promote: "Reserve wallet promotion",
  governance_threshold_change: "Governance threshold change",
  governance_owner_add: "Governance approver added",
  governance_owner_remove: "Governance approver removed",
  settlement_sweep: "Settlement sweep",
};

function formatOpLabel(kind: string) {
  return operationLabels[kind] ?? kind.replace(/_/g, " ");
}

export function DashboardTopbar({ onOpenSidebar }: DashboardTopbarProps) {
  const { mode, isUpdating, setMode } = useWorkspaceMode();
  const { user, signOut } = useDashboardSession();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: settingsData, reload: reloadSettings } = useResource(
    ({ token, merchantId }) =>
      loadWorkspaceSettings({ token, merchantId, environment: mode }),
    [mode]
  );

  useEffect(() => {
    const handleSettingsUpdate = () => {
      void reloadSettings();
    };

    window.addEventListener("treasury-updated", handleSettingsUpdate);
    return () => window.removeEventListener("treasury-updated", handleSettingsUpdate);
  }, [reloadSettings]);

  const pendingOps = (settingsData?.treasury.pendingOperations ?? []).filter(
    (op) => op.status === "pending_signatures" || op.status === "approved"
  );
  const pendingCount = pendingOps.length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    if (notifOpen || profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen, profileOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[#f4f7f1]/88 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white/82 text-[color:var(--ink)] lg:hidden"
          aria-label="Open dashboard navigation"
        >
          <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
            <path d="M3 5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 9H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 13H11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Search dashboard</span>
          <span className="relative block">
            <span className="pointer-events-none absolute inset-y-0 left-4 inline-flex items-center text-[color:var(--muted)]">
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="search"
              placeholder="Search customers, plans, payments"
              className="h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white/88 pl-11 pr-4 text-sm font-medium tracking-[-0.02em] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[#0c4a27]"
            />
          </span>
        </label>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="flex items-center rounded-2xl border border-[color:var(--line)] bg-white/82 p-1">
            <button
              type="button"
              onClick={() => void setMode("test")}
              disabled={isUpdating}
              aria-pressed={mode === "test"}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                mode === "test"
                  ? "bg-[#0c4a27] text-[#d9f6bc]"
                  : "text-[color:var(--muted)]"
              )}
            >
              Test
            </button>
            <button
              type="button"
              onClick={() => void setMode("live")}
              disabled={isUpdating}
              aria-pressed={mode === "live"}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                mode === "live"
                  ? "bg-[#0c4a27] text-[#d9f6bc]"
                  : "text-[color:var(--muted)]"
              )}
            >
              Live
            </button>
          </div>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white/82 text-[color:var(--ink)] transition-colors hover:bg-white"
              aria-label="Open notifications"
              aria-expanded={notifOpen}
            >
              <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
                <path
                  d="M9 3.5C6.79 3.5 5 5.29 5 7.5V9.31C5 9.7 4.85 10.08 4.57 10.36L3.75 11.18C3.12 11.81 3.56 12.88 4.46 12.88H13.54C14.44 12.88 14.88 11.81 14.25 11.18L13.43 10.36C13.15 10.08 13 9.7 13 9.31V7.5C13 5.29 11.21 3.5 9 3.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M7.25 14.25C7.58 14.83 8.22 15.25 9 15.25C9.78 15.25 10.42 14.83 10.75 14.25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>

              {pendingCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#922f25] px-1 text-[10px] font-bold leading-none text-white">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              ) : null}
            </button>

            {notifOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-[1.5rem] border border-[color:var(--line)] bg-white shadow-[0_16px_48px_rgba(12,74,39,0.10)]">
                <div className="border-b border-[color:var(--line)] px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Protected approvals
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    {pendingCount > 0
                      ? `${pendingCount} operation${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} signing`
                      : "No pending approvals"}
                  </p>
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {pendingOps.length > 0 ? (
                    pendingOps.map((op) => (
                      <div
                        key={op.id}
                        className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                            {formatOpLabel(op.kind)}
                          </p>
                          <p className="mt-0.5 text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            {op.status.replace(/_/g, " ")}
                          </p>
                        </div>
                        <Link
                          href={user?.governanceEnabled ? "/dashboard/governance" : "/dashboard/treasury"}
                          onClick={() => setNotifOpen(false)}
                          className="shrink-0 rounded-xl border border-[color:var(--line)] bg-[#f4f7f1] px-3 py-1.5 text-xs font-semibold tracking-[-0.01em] text-[color:var(--ink)] transition-colors hover:bg-[#edf7eb]"
                        >
                          Review
                        </Link>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-6 text-center text-sm text-[color:var(--muted)]">
                      All protected operations are up to date.
                    </div>
                  )}
                </div>

                {pendingOps.length > 0 ? (
                  <div className="border-t border-[color:var(--line)] px-5 py-3">
                    <Link
                      href={user?.governanceEnabled ? "/dashboard/governance" : "/dashboard/treasury"}
                      onClick={() => setNotifOpen(false)}
                      className="block text-center text-xs font-semibold tracking-[-0.01em] text-[color:var(--brand)] hover:underline"
                    >
                      View all approvals →
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[color:var(--line)] bg-white/82 px-3 transition-colors hover:bg-white"
              aria-label="Open account menu"
              aria-expanded={profileOpen}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#0c4a27] text-xs font-semibold text-[#d9f6bc]">
                {user?.name
                  ? user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? "")
                    .join("")
                  : "RW"}
              </span>
              <span className="hidden text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)] sm:inline">
                {user?.name ?? "Renew Labs"}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 10 6"
                className={`hidden h-2.5 w-2.5 text-[color:var(--muted)] transition-transform duration-150 sm:block ${profileOpen ? "rotate-180" : ""
                  }`}
                fill="none"
              >
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {profileOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-[1.5rem] border border-[color:var(--line)] bg-white shadow-[0_16px_48px_rgba(12,74,39,0.10)]">
                <div className="border-b border-[color:var(--line)] px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0c4a27] text-sm font-semibold text-[#d9f6bc]">
                      {user?.name
                        ? user.name
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() ?? "")
                          .join("")
                        : "RW"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                        {user?.name ?? "Renew Labs"}
                      </p>
                      <p className="truncate text-xs text-[color:var(--muted)]">
                        {user?.email ?? ""}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="py-1.5">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-[color:var(--ink)] transition-colors hover:bg-[#f4f7f1]"
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[color:var(--muted)]" fill="none">
                      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    Settings
                  </Link>
                </div>

                <div className="border-t border-[color:var(--line)] py-1.5">
                  <button
                    type="button"
                    onClick={() => { setProfileOpen(false); signOut(); }}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-sm font-medium text-[#922f25] transition-colors hover:bg-[#fff7f6]"
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none">
                      <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M10.5 5.5L13 8l-2.5 2.5M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Log out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
