export type SumsubApplicantType = "individual" | "company";

export type SumsubReviewSnapshot = {
  reviewStatus: string | null;
  reviewAnswer: string | null;
  rejectType: string | null;
  rejectLabels: string[];
  moderationComment: string | null;
  clientComment: string | null;
};

export type SumsubApplicantSummary = {
  applicantId: string;
  externalUserId: string;
  type: SumsubApplicantType;
  review: SumsubReviewSnapshot;
  raw: Record<string, unknown>;
};

export type CreateSumsubApplicantInput = {
  externalUserId: string;
  type: SumsubApplicantType;
  levelName: string;
  info?: {
    firstName?: string;
    lastName?: string;
    country?: string;
    email?: string;
  };
  companyInfo?: {
    companyName?: string;
    registrationNumber?: string;
    country?: string;
    taxId?: string;
  };
};

export type CreateSumsubAccessTokenInput = {
  externalUserId: string;
  levelName: string;
  ttlInSeconds: number;
  lang?: string;
};

export type SumsubAccessTokenResult = {
  token: string;
  expiresAt: string | null;
  userId: string;
  raw: Record<string, unknown>;
};

export type SumsubWebhookDigestInput = {
  rawBody: string;
  digest: string | null;
  algorithm: string | null;
};

export interface SumsubProvider {
  createApplicant(input: CreateSumsubApplicantInput): Promise<SumsubApplicantSummary>;
  generateSdkAccessToken(
    input: CreateSumsubAccessTokenInput
  ): Promise<SumsubAccessTokenResult>;
  getApplicantReview(applicantId: string): Promise<SumsubReviewSnapshot & { raw: Record<string, unknown> }>;
  verifyWebhookDigest(input: SumsubWebhookDigestInput): boolean;
}
