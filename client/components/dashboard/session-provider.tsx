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

import {
  ApiError,
  clearAccessToken,
  fetchApi,
  getApiBaseUrl,
  readAccessToken,
} from "@/lib/api";

export type AuthenticatedDashboardUser = {
  teamMemberId: string;
  merchantId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  workspaceMode: "test" | "live";
  permissions: string[];
  markets: string[];
  lastActiveAt: string | null;
  authProvider: string;
  operatorWalletAddress: string | null;
  onboardingStatus: string;
  governanceEnabled: boolean;
};

type DashboardSessionContextValue = {
  apiBaseUrl: string;
  token: string | null;
  user: AuthenticatedDashboardUser | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => void;
};

const DashboardSessionContext =
  createContext<DashboardSessionContextValue | null>(null);

async function loadAuthenticatedUser(token: string) {
  const response = await fetchApi<AuthenticatedDashboardUser>("/auth/me", {
    token,
  });

  return response.data;
}

export function DashboardSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedDashboardUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const nextToken = readAccessToken();

    startTransition(() => {
      setToken(nextToken);
    });

    if (!nextToken) {
      startTransition(() => {
        setUser(null);
        setError("Dashboard session is missing. Sign in again.");
        setIsLoading(false);
      });
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      return;
    }

    setIsLoading(true);

    try {
      const authenticatedUser = await loadAuthenticatedUser(nextToken);
      startTransition(() => {
        setUser(authenticatedUser);
        setError(null);
      });
    } catch (error) {
      const nextError =
        error instanceof ApiError
          ? error.message
          : "Unable to load dashboard session.";

      if (error instanceof ApiError && error.status === 401) {
        clearAccessToken();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }

      startTransition(() => {
        setUser(null);
        setError(nextError);
      });
    } finally {
      startTransition(() => {
        setIsLoading(false);
      });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<DashboardSessionContextValue>(
    () => ({
      apiBaseUrl: getApiBaseUrl(),
      token,
      user,
      isLoading,
      error,
      refresh,
      signOut() {
        clearAccessToken();
        startTransition(() => {
          setToken(null);
          setUser(null);
          setError("Dashboard session ended.");
        });
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
      },
    }),
    [error, isLoading, token, user]
  );

  return (
    <DashboardSessionContext.Provider value={value}>
      {children}
    </DashboardSessionContext.Provider>
  );
}

export function useDashboardSession() {
  const context = useContext(DashboardSessionContext);

  if (!context) {
    throw new Error(
      "useDashboardSession must be used within DashboardSessionProvider."
    );
  }

  return context;
}
