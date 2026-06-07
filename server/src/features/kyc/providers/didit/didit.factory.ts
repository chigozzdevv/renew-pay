import { DiditRemoteProvider } from "@/features/kyc/providers/didit/didit.remote";
import type { DiditProvider } from "@/features/kyc/providers/didit/didit.types";

let provider: DiditProvider | null = null;

export function getDiditProvider(): DiditProvider {
  if (provider) {
    return provider;
  }

  provider = new DiditRemoteProvider();

  return provider;
}
