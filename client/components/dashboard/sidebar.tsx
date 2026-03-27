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
  const { signOut, user } = useDashboardSession();
  const navItems = dashboardNav.filter(
    (item) => item.key !== "governance" || user?.governanceEnabled
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        mobile
          ? "rounded-[1.75rem] border border-white/85 bg-white/96 p-4 shadow-[0_30px_90px_rgba(16,32,20,0.12)]"
          : "border-r border-[color:var(--line)] bg-white/68 px-4 py-5 backdrop-blur-xl",
      )}
    >
      <Link
        href="/"
        onClick={onNavigate}
        className="inline-flex w-fit items-center rounded-2xl px-2 py-2"
        aria-label="Renew home"
      >
        <Logo />
      </Link>

      <div className="mt-6 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold tracking-[-0.02em] transition-all duration-200",
                isActive
                  ? "bg-[#0c4a27] text-[#d9f6bc]"
                  : "text-[color:var(--muted)] hover:bg-black/4 hover:text-[color:var(--ink)]",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-2xl",
                  isActive
                    ? "bg-white/10 text-[#d9f6bc]"
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

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white/82 px-4 py-3 text-left transition-all duration-200 hover:border-[#0c4a27]/12 hover:bg-[#f7fbf5]"
        >
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black/4 text-[color:var(--muted)]">
              <SidebarSignOutIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
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
    case "refresh":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <path d="M15.5 7.5A5.8 5.8 0 0 0 5.1 5.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M4.8 2.8V6.3H8.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 12.5A5.8 5.8 0 0 0 14.9 14.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M15.2 17.2V13.7H11.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
    case "vault":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <rect x="4" y="4" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.7" />
          <path d="M10 7.2V5.8M12.8 10H14.2M10 14.2V12.8M7.2 10H5.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "team":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <circle cx="6.5" cy="8" r="2" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="13.5" cy="8" r="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3.8 14.2C4.4 12.7 5.7 12 7 12C8.3 12 9.6 12.7 10.2 14.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M9.8 14.2C10.4 12.7 11.7 12 13 12C14.3 12 15.6 12.7 16.2 14.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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
    case "shield":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none">
          <path
            d="M10 3.5L15.2 5.6V9.2C15.2 12.4 13.1 15.3 10 16.5C6.9 15.3 4.8 12.4 4.8 9.2V5.6L10 3.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M8.1 10.1L9.4 11.4L12.4 8.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
