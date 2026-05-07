"use client";

import { useEffect, useRef, useState } from "react";

import type { RenewPaymentClient } from "../clients/payment-client.js";
import type {
  RenewPublicPaymentRecord,
  StartRenewPublicPaymentInput,
} from "../types/payment.js";

type PaymentEventHandler = (
  payment: RenewPublicPaymentRecord
) => void | Promise<void>;

export type UseRenewPublicPaymentOptions = {
  readonly client: RenewPaymentClient;
  readonly payId: string;
  readonly enabled?: boolean;
  readonly pollingIntervalMs?: number;
  readonly onPaymentChange?: PaymentEventHandler;
  readonly onSettled?: PaymentEventHandler;
  readonly onFailed?: PaymentEventHandler;
};

const POLLABLE_STATUSES = new Set(["pending", "paid", "settling"]);

export function useRenewPublicPayment(options: UseRenewPublicPaymentOptions) {
  const pollingIntervalMs = options.pollingIntervalMs ?? 2500;
  const [payment, setPayment] = useState<RenewPublicPaymentRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const commitPayment = async (nextPayment: RenewPublicPaymentRecord) => {
    setPayment(nextPayment);
    setError(null);

    if (options.onPaymentChange) {
      await options.onPaymentChange(nextPayment);
    }

    if (lastStatusRef.current !== nextPayment.status) {
      lastStatusRef.current = nextPayment.status;

      if (nextPayment.status === "settled" && options.onSettled) {
        await options.onSettled(nextPayment);
      }

      if (nextPayment.status === "failed" && options.onFailed) {
        await options.onFailed(nextPayment);
      }
    }

    return nextPayment;
  };

  const refresh = async () => {
    if (!options.payId.trim()) {
      return null;
    }

    setIsLoading(true);

    try {
      return await commitPayment(
        await options.client.getPublicPayment(options.payId)
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Payment unavailable.");
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  };

  const start = async (input: StartRenewPublicPaymentInput) => {
    if (!options.payId.trim()) {
      throw new Error("payId is required.");
    }

    setIsStarting(true);

    try {
      return await commitPayment(
        await options.client.startPublicPayment(options.payId, input)
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Payment could not start.");
      throw nextError;
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (!options.enabled) {
      return;
    }

    void refresh().catch(() => undefined);
  }, [options.enabled, options.payId]);

  useEffect(() => {
    if (
      !options.enabled ||
      !payment ||
      !POLLABLE_STATUSES.has(payment.status)
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, pollingIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [options.enabled, payment, pollingIntervalMs]);

  return {
    payment,
    error,
    isLoading,
    isStarting,
    isPolling:
      Boolean(options.enabled) &&
      Boolean(payment) &&
      POLLABLE_STATUSES.has(payment?.status ?? ""),
    refresh,
    start,
  };
}
