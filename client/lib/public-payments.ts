"use client";

import { ApiError, fetchApi } from "@/lib/api";

export type PublicPayment = {
  payId: string;
  amount: number;
  currency: string;
  description: string | null;
  items: Array<{
    name: string;
    quantity: number;
    amount: number;
  }>;
  status: "open" | "pending" | "paid" | "settling" | "settled" | "failed" | "cancelled";
  paymentUrl: string;
  merchant: {
    name: string;
    supportEmail: string | null;
    logoUrl: string | null;
  };
  recurring: {
    enabled: boolean;
    interval: "day" | "week" | "month" | "year" | null;
    intervalCount: number | null;
  };
  customer: {
    reference: string | null;
    email: string | null;
    name: string | null;
  };
  checkout: {
    state:
      | "needs_customer"
      | "ready_to_pay"
      | "needs_bvn"
      | "needs_verification_method"
      | "needs_phone"
      | "needs_otp"
      | "show_bank_transfer"
      | "processing"
      | "paid"
      | "failed"
      | "cancelled";
    verification: {
      methods: Array<{
        method: string;
        hint: string | null;
      }>;
      selectedMethod: string | null;
      selectedHint: string | null;
      phoneConfirmationRequired: boolean;
      message: string | null;
      bvnLast4: string | null;
      sandbox: {
        bvn: string | null;
        phone: string | null;
        otp: string | null;
      };
    };
    returnPage: string | null;
    bankTransfer: {
      bankCode: string | null;
      bankName: string | null;
      accountName: string | null;
      accountNumber: string | null;
      currency: string | null;
    } | null;
  };
  collection: {
    provider: "partna";
    status: string;
    localAmount: number;
    stableAmount: number | null;
    feeAmount: number | null;
    paidAt: string | null;
    paymentUrl: string | null;
  };
};

export type PublicCheckoutBank = {
  code: string;
  name: string;
};

export type PublicPaymentIssueFile = {
  url: string;
  name: string;
  type: string | null;
  size: number | null;
  publicId: string | null;
};

export type PublicPaymentIssue = {
  id: string;
  payId: string;
  paymentId: string;
  payoutId: string | null;
  issueType: string;
  details: string;
  reporterEmail: string | null;
  reporterName: string | null;
  files: PublicPaymentIssueFile[];
  status: string;
  heldAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentIssueUploadSignature = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  folder: string;
  timestamp: number;
  signature: string;
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  resource_type?: string;
  bytes?: number;
  error?: {
    message?: string;
  };
};

export async function loadPublicPayment(payId: string) {
  const response = await fetchApi<PublicPayment>(`/pay/${payId}`);

  return response.data;
}

export async function loadPublicPaymentBanks(payId: string) {
  const response = await fetchApi<PublicCheckoutBank[]>(`/pay/${payId}/banks`);

  return response.data;
}

export async function createPaymentIssueUploadSignature(payId: string) {
  const response = await fetchApi<PaymentIssueUploadSignature>(
    `/pay/${payId}/issues/files/signature`,
    {
      method: "POST",
    }
  );

  return response.data;
}

export async function uploadPaymentIssueFile(input: {
  payId: string;
  file: File;
}) {
  const signature = await createPaymentIssueUploadSignature(input.payId);
  const formData = new FormData();

  formData.append("file", input.file);
  formData.append("api_key", signature.apiKey);
  formData.append("folder", signature.folder);
  formData.append("signature", signature.signature);
  formData.append("timestamp", String(signature.timestamp));

  const response = await fetch(signature.uploadUrl, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => null)) as
    | CloudinaryUploadResponse
    | null;

  if (!response.ok || !payload?.secure_url) {
    throw new ApiError(
      response.status || 500,
      payload?.error?.message ?? "File upload failed."
    );
  }

  return {
    url: payload.secure_url,
    name: input.file.name,
    type: input.file.type || payload.resource_type || null,
    size: input.file.size || payload.bytes || null,
    publicId: payload.public_id ?? null,
  } satisfies PublicPaymentIssueFile;
}

export async function submitPaymentIssue(input: {
  payId: string;
  issueType: string;
  details: string;
  reporterEmail?: string | null;
  reporterName?: string | null;
  files?: PublicPaymentIssueFile[];
}) {
  const response = await fetchApi<PublicPaymentIssue>(`/pay/${input.payId}/issues`, {
    method: "POST",
    body: JSON.stringify({
      issueType: input.issueType,
      details: input.details,
      reporterEmail: input.reporterEmail || undefined,
      reporterName: input.reporterName || undefined,
      files: input.files ?? [],
    }),
  });

  return response.data;
}

export async function submitPublicCheckoutCustomer(input: {
  payId: string;
  email: string;
  name: string;
}) {
  const response = await fetchApi<PublicPayment>(`/pay/${input.payId}/customer`, {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      name: input.name,
    }),
  });

  return response.data;
}

export async function startPublicCheckoutKyc(input: {
  payId: string;
  bvn: string;
  kesMobileNetwork?: string;
  kesShortcode?: string;
}) {
  const response = await fetchApi<PublicPayment>(`/pay/${input.payId}/kyc/bvn`, {
    method: "POST",
    body: JSON.stringify({
      bvn: input.bvn,
      kesMobileNetwork: input.kesMobileNetwork || undefined,
      kesShortcode: input.kesShortcode || undefined,
    }),
  });

  return response.data;
}

export async function selectPublicCheckoutKycMethod(input: {
  payId: string;
  verificationMethod: string;
  accountNumber?: string;
  bankCode?: string;
}) {
  const response = await fetchApi<PublicPayment>(`/pay/${input.payId}/kyc/method`, {
    method: "POST",
    body: JSON.stringify({
      verificationMethod: input.verificationMethod,
      accountNumber: input.accountNumber || undefined,
      bankCode: input.bankCode || undefined,
    }),
  });

  return response.data;
}

export async function confirmPublicCheckoutPhone(input: {
  payId: string;
  phone: string;
}) {
  const response = await fetchApi<PublicPayment>(`/pay/${input.payId}/kyc/phone`, {
    method: "POST",
    body: JSON.stringify({
      phone: input.phone,
    }),
  });

  return response.data;
}

export async function confirmPublicCheckoutOtp(input: {
  payId: string;
  otp: string;
}) {
  const response = await fetchApi<PublicPayment>(`/pay/${input.payId}/kyc/otp`, {
    method: "POST",
    body: JSON.stringify({
      otp: input.otp,
    }),
  });

  return response.data;
}

export async function startPublicPayment(input: {
  payId: string;
  payerEmail?: string;
  payerName?: string;
}) {
  const response = await fetchApi<PublicPayment>(`/pay/${input.payId}/start`, {
    method: "POST",
    body: JSON.stringify({
      payerEmail: input.payerEmail || undefined,
      payerName: input.payerName || undefined,
    }),
  });

  return response.data;
}

export async function confirmPublicPayment(input: { payId: string }) {
  const response = await fetchApi<PublicPayment>(`/pay/${input.payId}/confirm`, {
    method: "POST",
  });

  return response.data;
}
