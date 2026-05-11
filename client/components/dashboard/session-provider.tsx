"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getAccessToken, getIdentityToken, usePrivy } from "@privy-io/react-auth";

import {
  accessTokenStorageKey,
  ApiError,
  clearAccessToken,
  fetchApi,
  getApiBaseUrl,
  readAccessToken,
} from "@/lib/api";
import { exchangePrivySession } from "@/lib/auth";

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
};

type DashboardSessionContextValue = {
  apiBaseUrl: string;
  token: string | null;
  user: AuthenticatedDashboardUser | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<boolean>;
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

function getCurrentPath() {
  if (typeof window === "undefined") {
    return "/dashboard";
  }

  return `${window.location.pathname}${window.location.search}`;
}

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }

  const nextPath = getCurrentPath();
  window.location.replace(`/login?next=${encodeURIComponent(nextPath)}`);
}

function writeAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(accessTokenStorageKey, token);
}

function extractPrivyEmail(user: unknown) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const directEmail =
    "email" in user &&
    typeof user.email === "object" &&
    user.email !== null &&
    "address" in user.email &&
    typeof user.email.address === "string"
      ? user.email.address.trim().toLowerCase()
      : null;

  if (directEmail) {
    return directEmail;
  }

  const linkedAccounts =
    "linkedAccounts" in user && Array.isArray(user.linkedAccounts)
      ? user.linkedAccounts
      : "linked_accounts" in user && Array.isArray(user.linked_accounts)
        ? user.linked_accounts
        : [];

  for (const account of linkedAccounts) {
    if (!account || typeof account !== "object") {
      continue;
    }

    if ("email" in account && typeof account.email === "string" && account.email.trim()) {
      return account.email.trim().toLowerCase();
    }

    const accountType =
      "type" in account && typeof account.type === "string"
        ? account.type.trim().toLowerCase()
        : null;

    if (
      accountType === "email" &&
      "address" in account &&
      typeof account.address === "string" &&
      account.address.trim()
    ) {
      return account.address.trim().toLowerCase();
    }
  }

  return null;
}

export function DashboardSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { ready, authenticated, user: privyUser, logout } = usePrivy();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedDashboardUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);

  const exchangePrivyAccess = useCallback(async () => {
    const authToken = await getAccessToken();
    let identityToken: string | null = null;

    try {
      identityToken = await getIdentityToken();
    } catch {
      identityToken = null;
    }

    if (!authToken) {
      throw new ApiError(401, "Privy session is not ready.");
    }

    const session = await exchangePrivySession({
      authToken,
      identityToken,
      email: extractPrivyEmail(privyUser) ?? undefined,
    });

    writeAccessToken(session.accessToken);
    return session.accessToken;
  }, [privyUser]);

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      let keepLoading = false;
      const nextToken = readAccessToken();

      if (!nextToken && !ready) {
        setIsLoading(true);
        return false;
      }

      let activeToken = nextToken;

      if (!activeToken && authenticated) {
        try {
          activeToken = await exchangePrivyAccess();
        } catch {
          activeToken = null;
        }
      }

      setToken(activeToken);

      if (!activeToken) {
        setUser(null);
        setError("Dashboard session is missing. Sign in again.");
        setIsLoading(false);
        redirectToLogin();
        return false;
      }

      setIsLoading(true);

      try {
        const authenticatedUser = await loadAuthenticatedUser(activeToken);
        setUser(authenticatedUser);
        setError(null);
        setToken(activeToken);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearAccessToken();

          if (ready && authenticated) {
            try {
              const recoveredToken = await exchangePrivyAccess();
              const authenticatedUser = await loadAuthenticatedUser(recoveredToken);
              setToken(recoveredToken);
              setUser(authenticatedUser);
              setError(null);
              return true;
            } catch (recoveryError) {
              const nextError =
                recoveryError instanceof ApiError
                  ? recoveryError.message
                  : "Unable to recover dashboard session.";
              setToken(null);
              setUser(null);
              setError(nextError);
              redirectToLogin();
              return false;
            }
          }

          if (!ready) {
            setToken(null);
            setUser(null);
            setError(null);
            keepLoading = true;
            return false;
          }

          setToken(null);
          setUser(null);
          setError(error.message);
          redirectToLogin();
          return false;
        }

        const nextError =
          error instanceof ApiError
            ? error.message
            : "Unable to load dashboard session.";
        setUser(null);
        setError(nextError);
        return false;
      } finally {
        setIsLoading(keepLoading);
      }
    })();

    refreshPromiseRef.current = refreshPromise;

    try {
      return await refreshPromise;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [authenticated, exchangePrivyAccess, ready]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        setToken(null);
        setUser(null);
        setError("Dashboard session ended.");
        if (typeof window !== "undefined") {
          void (async () => {
            try {
              await logout?.();
            } catch {
            } finally {
              window.location.replace("/");
            }
          })();
        }
      },
    }),
    [error, isLoading, logout, refresh, token, user]
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
