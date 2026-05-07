"use client";

import Link from "next/link";

import { useDashboardSession } from "@/components/dashboard/session-provider";
import { dashboardNav } from "@/lib/dashboard";
import type { DashboardNavItem } from "@/types/dashboard";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

type DashboardSidebarProps = {
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
};

export function DashboardSidebar({
  pathname,
  mobile = false,
  onNavigate,
}: DashboardSidebarProps) {
  const { signOut } = useDashboardSession();

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        mobile
          ? "rounded-xl border border-[color:var(--line)] bg-white p-3 shadow-[0_20px_60px_rgba(16,32,20,0.12)]"
          : "border-r border-[color:var(--line)] bg-white px-3 py-4",
      )}
    >
      <Link
        href="/"
        onClick={onNavigate}
        className="inline-flex w-fit items-center rounded-lg px-2 py-2"
        aria-label="Renew home"
      >
        <Logo size="compact" />
      </Link>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-1 pb-4">
          {dashboardNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-black/4 text-[color:var(--ink)]"
                    : "text-[color:var(--muted)] hover:bg-black/4 hover:text-[color:var(--ink)]",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-white text-[color:var(--ink)] shadow-[inset_0_0_0_1px_rgba(12,18,14,0.04)]"
                      : "bg-black/4 text-[color:var(--muted)]",
                  )}
                >
                  <SidebarIcon icon={item.icon} className="h-[18px] w-[18px]" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 pt-4">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center justify-between rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--soft)]"
        >
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/4 text-[color:var(--muted)]">
              <SidebarSignOutIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="text-sm font-medium text-[color:var(--ink)]">
              Sign out
            </span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-[color:var(--muted)]" fill="none">
            <path d="M7 5L12 10L7 15" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type SidebarIconProps = {
  icon: DashboardNavItem["icon"];
  className?: string;
};

function SidebarIcon({ icon, className }: SidebarIconProps) {
  switch (icon) {
    case "home":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <path d="M3.5 8.5L10 3L16.5 8.5V16.5H3.5V8.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M8 16.5V11.5H12V16.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    case "users":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="13.5" cy="8" r="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3.5 15C4.2 12.9 6 11.8 7.9 11.8C9.8 11.8 11.6 12.9 12.3 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M12 14.6C12.4 13.4 13.5 12.8 14.8 12.8C16 12.8 17 13.5 17.4 14.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "stack":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <path d="M4 7L10 4L16 7L10 10L4 7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M4 10.5L10 13.5L16 10.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M4 14L10 17L16 14" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    case "receipt":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <path d="M6 3.8H14V16.2L12.2 15L10 16.2L7.8 15L6 16.2V3.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M8 7H12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M8 10H12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M8 13H10.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "card":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <rect x="3" y="5" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3 8.5H17" stroke="currentColor" strokeWidth="1.7" />
          <path d="M6.5 12.3H9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "wallet":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H15v12H6.5A2.5 2.5 0 0 1 4 13.5v-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M14 9H17V13H14A2 2 0 0 1 14 9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M6.2 7H13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "code":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <path d="M7.3 6.2L3.8 10L7.3 13.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12.7 6.2L16.2 10L12.7 13.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11.2 4.8L8.8 15.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "gear":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M10 3.8V5M10 15V16.2M15 10H16.2M3.8 10H5M14.4 5.6L13.5 6.5M6.5 13.5L5.6 14.4M14.4 14.4L13.5 13.5M6.5 6.5L5.6 5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
  }
}

function SidebarSignOutIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
      <path
        d="M8 4.5H6.6A2.1 2.1 0 0 0 4.5 6.6v6.8a2.1 2.1 0 0 0 2.1 2.1H8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10 6.5L13.5 10L10 13.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 10H13.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
