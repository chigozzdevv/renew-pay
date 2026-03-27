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
  const [mode, setModeState] = useState<WorkspaceMode>("test");

  useEffect(() => {
    const storedMode = readStoredMode() ?? "test";
    startTransition(() => {
      setModeState(storedMode);
    });

  }, []);

  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      isUpdating: false,
      async setMode(nextMode) {
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
