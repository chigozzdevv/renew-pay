import type { PaymentRailProvider } from "@/features/payment-rails/payment-rail.types";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getDefaultPaymentRailProvider(_mode?: RuntimeMode): PaymentRailProvider {
  return "partna";
}
