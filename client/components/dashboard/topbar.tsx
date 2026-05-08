"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import { cn } from "@/lib/utils";

type DashboardTopbarProps = {
  onOpenSidebar: () => void;
};

export function DashboardTopbar({ onOpenSidebar }: DashboardTopbarProps) {
  const { mode, isUpdating, setMode } = useWorkspaceMode();
  const { user, signOut } = useDashboardSession();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

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
    <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-white/95 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--line)] bg-white text-[color:var(--ink)] lg:hidden"
          aria-label="Open dashboard navigation"
        >
          <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4" fill="none">
            <path d="M3 5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 9H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 13H11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center rounded-lg border border-[color:var(--line)] bg-white p-1">
            <button
              type="button"
              onClick={() => void setMode("test")}
              disabled={isUpdating}
              aria-pressed={mode === "test"}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                mode === "test"
                  ? "bg-[color:var(--ink)] text-white"
                  : "text-[color:var(--muted)]"
              )}
            >
              Test
            </button>
            <button
              type="button"
              disabled
              title="Live"
              aria-pressed={false}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                "text-[color:var(--muted)]"
              )}
            >
              Live
            </button>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--line)] bg-white text-[color:var(--ink)] transition-colors hover:bg-[color:var(--soft)]"
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

            </button>

            {notifOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-xl border border-[color:var(--line)] bg-white shadow-[0_16px_48px_rgba(17,17,17,0.08)]">
                <div className="border-b border-[color:var(--line)] px-5 py-4">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Notifications</p>
                </div>

                <div className="px-5 py-6 text-center text-sm text-[color:var(--muted)]">
                  None
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--line)] bg-white transition-colors hover:bg-[color:var(--soft)]"
              aria-label="Open account menu"
              aria-expanded={profileOpen}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--ink)] text-xs font-semibold text-white">
                {user?.name
                  ? user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? "")
                    .join("")
                  : "RW"}
              </span>
            </button>

            {profileOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-[color:var(--line)] bg-white shadow-[0_16px_48px_rgba(17,17,17,0.08)]">
                <div className="border-b border-[color:var(--line)] px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--ink)] text-sm font-semibold text-white">
                      {user?.name
                        ? user.name
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() ?? "")
                          .join("")
                        : "RW"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
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
                    className="flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-[color:var(--ink)] transition-colors hover:bg-[color:var(--soft)]"
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
