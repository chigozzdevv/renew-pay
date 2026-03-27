"use client";

import { useEffect, useRef, useState } from "react";

import type { RenewCheckoutClient } from "../clients/checkout-client.js";
import type {
  RenewCheckoutSession,
  SubmitCheckoutCustomerInput,
} from "../types/checkout.js";

type RenewCheckoutSessionEventHandler = (
  session: RenewCheckoutSession
) => void | Promise<void>;

export type UseRenewCheckoutSessionOptions = {
  readonly client: RenewCheckoutClient;
  readonly initialSession: RenewCheckoutSession | null;
  readonly clientSecret?: string | null;
  readonly enabled?: boolean;
  readonly pollingIntervalMs?: number;
  readonly onSessionChange?: RenewCheckoutSessionEventHandler;
  readonly onSettled?: RenewCheckoutSessionEventHandler;
  readonly onFailed?: RenewCheckoutSessionEventHandler;
};

type CommitSessionOptions = {
  readonly emitChange?: boolean;
};

const POLLABLE_STATUSES = new Set([
  "scheduled",
  "pending_payment",
  "processing",
]);

function getClientSecret(options: UseRenewCheckoutSessionOptions) {
  return options.clientSecret ?? null;
}

export function useRenewCheckoutSession(
  options: UseRenewCheckoutSessionOptions
) {
  const pollingIntervalMs = options.pollingIntervalMs ?? 2500;
  const [session, setSession] = useState<RenewCheckoutSession | null>(
    options.initialSession
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
  const [isCompletingTestPayment, setIsCompletingTestPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastEmittedStatusRef = useRef<string | null>(options.initialSession?.status ?? null);

  useEffect(() => {
    setSession(options.initialSession);
    lastEmittedStatusRef.current = options.initialSession?.status ?? null;
    setError(null);
  }, [options.initialSession]);

  const commitSession = async (
    nextSession: RenewCheckoutSession,
    commitOptions?: CommitSessionOptions
  ) => {
    setSession(nextSession);
    setError(null);

    if (commitOptions?.emitChange !== false && options.onSessionChange) {
      await options.onSessionChange(nextSession);
    }

    if (lastEmittedStatusRef.current !== nextSession.status) {
      lastEmittedStatusRef.current = nextSession.status;

      if (nextSession.status === "settled" && options.onSettled) {
        await options.onSettled(nextSession);
      }

      if (nextSession.status === "failed" && options.onFailed) {
        await options.onFailed(nextSession);
      }
    }

    return nextSession;
  };

  const refresh = async () => {
    const clientSecret = getClientSecret(options);

    if (!session || !clientSecret) {
      return null;
    }

    setIsRefreshing(true);

    try {
      const nextSession = await options.client.getSession(session.id, {
        clientSecret,
      });

      return await commitSession(nextSession);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to refresh checkout session."
      );
      throw nextError;
    } finally {
      setIsRefreshing(false);
    }
  };

  const submitCustomer = async (input: SubmitCheckoutCustomerInput) => {
    const clientSecret = getClientSecret(options);

    if (!session || !clientSecret) {
      throw new Error("Checkout session is not ready.");
    }

    setIsSubmittingCustomer(true);

    try {
      const nextSession = await options.client.submitCustomer(session.id, input, {
        clientSecret,
      });

      return await commitSession(nextSession);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to submit checkout customer."
      );
      throw nextError;
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const completeTestPayment = async () => {
    const clientSecret = getClientSecret(options);

    if (!session || !clientSecret) {
      throw new Error("Checkout session is not ready.");
    }

    setIsCompletingTestPayment(true);

    try {
      const nextSession = await options.client.completeTestPayment(session.id, {
        clientSecret,
      });

      return await commitSession(nextSession);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to complete test payment."
      );
      throw nextError;
    } finally {
      setIsCompletingTestPayment(false);
    }
  };

  useEffect(() => {
    if (
      !options.enabled ||
      !session ||
      !getClientSecret(options) ||
      !POLLABLE_STATUSES.has(session.status)
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, pollingIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    options.clientSecret,
    options.enabled,
    pollingIntervalMs,
    session,
  ]);

  return {
    session,
    error,
    isRefreshing,
    isPolling:
      Boolean(options.enabled) &&
      Boolean(session) &&
      POLLABLE_STATUSES.has(session?.status ?? ""),
    isSubmittingCustomer,
    isCompletingTestPayment,
    refresh,
    submitCustomer,
    completeTestPayment,
  };
}
