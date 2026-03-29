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

import { workspaceModeStorageKey } from "@/lib/api";

type WorkspaceMode = "test" | "live";

type ModeContextValue = {
  mode: WorkspaceMode;
  isUpdating: boolean;
  setMode: (mode: WorkspaceMode) => Promise<void>;
};

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<WorkspaceMode>("test");

  useEffect(() => {
    const nextMode = "test";

    if (typeof window !== "undefined") {
      window.localStorage.setItem(workspaceModeStorageKey, nextMode);
    }

    startTransition(() => {
      setModeState(nextMode);
    });
  }, []);

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      isUpdating: false,
      async setMode(nextMode) {
        if (nextMode === "live") {
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
    [mode]
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
