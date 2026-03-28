import { PartnaRemoteProvider } from "@/features/payment-rails/providers/partna/partna.remote";
import type { PartnaProvider } from "@/features/payment-rails/providers/partna/partna.types";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

const providerInstances = new Map<RuntimeMode, PartnaProvider>();

export function getPartnaProvider(mode: RuntimeMode): PartnaProvider {
  const existingProvider = providerInstances.get(mode);

  if (existingProvider) {
    return existingProvider;
  }

  const provider = new PartnaRemoteProvider(mode);
  providerInstances.set(mode, provider);

  return provider;
}
