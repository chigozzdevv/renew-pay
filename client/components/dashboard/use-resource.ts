"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { useDashboardSession } from "@/components/dashboard/session-provider";

type ResourceState<T> = {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useResource<T>(
  loader: (input: { token: string; merchantId: string }) => Promise<T>,
  deps: readonly unknown[] = []
): ResourceState<T> {
  const { token, user, isLoading: isSessionLoading, error: sessionError } =
    useDashboardSession();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!token || !user?.merchantId) {
      setData(null);
      setError(sessionError ?? "Dashboard session is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const nextData = await loader({
        token,
        merchantId: user.merchantId,
      });
      setData(nextData);
      setError(null);
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "Unable to load resource."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    void reload();
    // The loader is expected to be stable where it is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionLoading, token, user?.merchantId, sessionError, ...deps]);

  return {
    data,
    isLoading: isSessionLoading || isLoading,
    error: sessionError ?? error,
    reload,
  };
}
