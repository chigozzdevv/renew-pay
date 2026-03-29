"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useDashboardSession } from "@/components/dashboard/session-provider";
import { workspaceModeStorageKey } from "@/lib/api";

type WorkspaceMode = "test" | "live";

type ModeContextValue = {
  mode: WorkspaceMode;
  isUpdating: boolean;
  setMode: (mode: WorkspaceMode) => Promise<void>;
};

const ModeContext = createContext<ModeContextValue | null>(null);

function readStoredMode(): WorkspaceMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(workspaceModeStorageKey);

  if (value === "live") {
    return "live";
  }

  if (value === "test") {
    return "test";
  }

  return null;
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const { user } = useDashboardSession();
  const [mode, setModeState] = useState<WorkspaceMode>("test");

  useEffect(() => {
    const storedMode = readStoredMode() ?? user?.workspaceMode ?? "test";
    const nextMode =
      user?.onboardingStatus !== "workspace_active" ? "test" : storedMode;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(workspaceModeStorageKey, nextMode);
    }

    startTransition(() => {
      setModeState(nextMode);
    });
  }, [user?.onboardingStatus, user?.workspaceMode]);

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      isUpdating: false,
      async setMode(nextMode) {
        if (
          nextMode === "live" &&
          user?.onboardingStatus !== "workspace_active"
        ) {
          window.localStorage.setItem(workspaceModeStorageKey, "test");
          startTransition(() => {
            setModeState("test");
          });
          return;
        }

        if (nextMode === mode) {
          return;
        }
        window.localStorage.setItem(workspaceModeStorageKey, nextMode);
        startTransition(() => {
          setModeState(nextMode);
        });
      },
    }),
    [mode, user?.onboardingStatus]
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useWorkspaceMode() {
  const context = useContext(ModeContext);

  if (!context) {
    throw new Error("useWorkspaceMode must be used within ModeProvider.");
  }

  return context;
}
