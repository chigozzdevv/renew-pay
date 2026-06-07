export type DiditSessionKind = "user" | "business";

export type DiditReviewSnapshot = {
  status: string | null;
  reviewAnswer: string | null;
  rejectType: string | null;
  rejectLabels: string[];
  moderationComment: string | null;
  clientComment: string | null;
};

export type DiditSessionSummary = {
  sessionId: string;
  sessionKind: DiditSessionKind | null;
  sessionToken: string | null;
  url: string;
  vendorData: string;
  workflowId: string;
  review: DiditReviewSnapshot;
  raw: Record<string, unknown>;
};

export type CreateDiditSessionInput = {
  workflowId: string;
  vendorData: string;
  callback: string;
  language?: string;
  metadata?: Record<string, unknown>;
  contactDetails?: {
    email?: string;
    phone?: string;
  };
  expectedDetails?: Record<string, unknown>;
};

export type DiditWebhookSignatureInput = {
  rawBody: string;
  payload: Record<string, unknown>;
  timestamp: string | null;
  signature: string | null;
  signatureV2: string | null;
  signatureSimple: string | null;
};

export interface DiditProvider {
  createSession(input: CreateDiditSessionInput): Promise<DiditSessionSummary>;
  getSessionDecision(
    sessionId: string
  ): Promise<DiditReviewSnapshot & { raw: Record<string, unknown> }>;
  verifyWebhookSignature(input: DiditWebhookSignatureInput): boolean;
}
