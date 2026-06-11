import { getVerificationConfig } from "@/config/verification.config";
import { DiditRemoteProvider } from "@/features/kyc/providers/didit/didit.remote";
import { SumsubRemoteProvider } from "@/features/kyc/providers/sumsub/sumsub.remote";
import type {
  VerificationProvider,
  VerificationProviderName,
} from "@/features/kyc/providers/verification.types";

const providers: Partial<Record<VerificationProviderName, VerificationProvider>> = {};

export function getVerificationProvider(
  providerName: VerificationProviderName = getVerificationConfig().provider
) {
  if (providerName === "sumsub") {
    providers.sumsub ??= new SumsubRemoteProvider();
    return providers.sumsub;
  }

  providers.didit ??= new DiditRemoteProvider();
  return providers.didit;
}
