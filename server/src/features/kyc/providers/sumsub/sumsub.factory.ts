import { SumsubLiveProvider } from "@/features/kyc/providers/sumsub/sumsub.live";
import type { SumsubProvider } from "@/features/kyc/providers/sumsub/sumsub.types";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

const providers = new Map<RuntimeMode, SumsubProvider>();

export function getSumsubProvider(mode: RuntimeMode): SumsubProvider {
  const existing = providers.get(mode);

  if (existing) {
    return existing;
  }

  const provider = new SumsubLiveProvider(mode);
  providers.set(mode, provider);

  return provider;
}
