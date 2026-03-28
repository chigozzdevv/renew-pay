import { env } from "@/config/env.config";
import type { PaymentRailProvider } from "@/features/payment-rails/payment-rail.types";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getDefaultPaymentRailProvider(
  mode: RuntimeMode = env.PAYMENT_ENV
): PaymentRailProvider {
  return mode === "live"
    ? env.PAYMENT_RAIL_PROVIDER_LIVE
    : env.PAYMENT_RAIL_PROVIDER_TEST;
}
