import type {
  CreateVerificationSessionInput,
  VerificationProvider,
  VerificationReviewSnapshot,
  VerificationSessionKind,
  VerificationSessionSummary,
  VerificationWebhookSignatureInput,
} from "@/features/kyc/providers/verification.types";

export type DiditSessionKind = VerificationSessionKind;
export type DiditReviewSnapshot = VerificationReviewSnapshot;
export type DiditSessionSummary = VerificationSessionSummary;
export type CreateDiditSessionInput = CreateVerificationSessionInput;
export type DiditWebhookSignatureInput = VerificationWebhookSignatureInput;
export type DiditProvider = VerificationProvider;
