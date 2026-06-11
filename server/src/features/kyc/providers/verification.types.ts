export type VerificationProviderName = "didit" | "sumsub";
export type VerificationSessionKind = "user" | "business";

export type VerificationReviewSnapshot = {
  status: string | null;
  reviewAnswer: string | null;
  rejectType: string | null;
  rejectLabels: string[];
  moderationComment: string | null;
  clientComment: string | null;
};

export type VerificationSessionSummary = {
  provider: VerificationProviderName;
  sessionId: string;
  sessionKind: VerificationSessionKind | null;
  sessionToken: string | null;
  url: string;
  vendorData: string;
  levelName: string;
  review: VerificationReviewSnapshot;
  raw: Record<string, unknown>;
};

export type CreateVerificationSessionInput = {
  levelName: string;
  vendorData: string;
  callback: string;
  language?: string;
  metadata?: Record<string, unknown>;
  contactDetails?: {
    email?: string;
    phone?: string;
  };
  expectedDetails?: Record<string, unknown>;
  subjectType: "owner" | "merchant";
};

export type VerificationWebhookSignatureInput = {
  rawBody: string;
  payload: Record<string, unknown>;
  headers: Record<string, string | null>;
};

export interface VerificationProvider {
  readonly name: VerificationProviderName;
  createSession(
    input: CreateVerificationSessionInput
  ): Promise<VerificationSessionSummary>;
  getSessionDecision(
    sessionId: string
  ): Promise<VerificationReviewSnapshot & { raw: Record<string, unknown> }>;
  verifyWebhookSignature(input: VerificationWebhookSignatureInput): boolean;
}

