import { YellowCardLiveProvider } from "@/features/payment-rails/providers/yellow-card/yellow-card.live";
import { YellowCardSimulatedProvider } from "@/features/payment-rails/providers/yellow-card/yellow-card.simulated";
import type { YellowCardProvider } from "@/features/payment-rails/providers/yellow-card/yellow-card.types";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

const providerInstances = new Map<RuntimeMode, YellowCardProvider>();

export function getYellowCardProvider(mode: RuntimeMode): YellowCardProvider {
  const existingProvider = providerInstances.get(mode);

  if (existingProvider) {
    return existingProvider;
  }

  const provider =
    mode === "live"
      ? new YellowCardLiveProvider(mode)
      : new YellowCardSimulatedProvider(mode);
  providerInstances.set(mode, provider);

  return provider;
}
