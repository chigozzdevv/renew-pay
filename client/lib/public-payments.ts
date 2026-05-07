"use client";

import { fetchApi } from "@/lib/api";

export type PublicPayment = {
  payId: string;
  amount: number;
  currency: string;
  description: string | null;
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
    };
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

export async function loadPublicPayment(payId: string) {
  const response = await fetchApi<PublicPayment>(`/pay/${payId}`);

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
