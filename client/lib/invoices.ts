"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "pending_payment"
  | "processing"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitAmountUsd: number;
  totalAmountUsd: number;
};

export type InvoicePaymentInstructions = {
  provider: string | null;
  kind: string | null;
  externalChargeId: string | null;
  billingCurrency: string | null;
  localAmount: number | null;
  usdcAmount: number | null;
  feeAmount: number | null;
  status: string | null;
  reference: string | null;
  expiresAt: string | null;
  redirectUrl: string | null;
  bankTransfer: {
    bankCode: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
    currency: string | null;
  } | null;
} | null;

export type InvoiceRecord = {
  id: string;
  merchantId: string;
  environment: "test" | "live";
  invoiceNumber: string;
  publicToken: string;
  publicUrl: string;
  title: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  billingCurrency: string;
  status: InvoiceStatus;
  note: string | null;
  dueDate: string;
  issuedAt: string | null;
  sentAt: string | null;
  lastRemindedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  lineItems: InvoiceLineItem[];
  totals: {
    usdAmount: number;
    localAmount: number;
    fxRate: number;
    usdcAmount: number;
    feeAmount: number;
  };
  charge: {
    id: string;
    externalChargeId: string;
    status: string;
    failureCode: string | null;
    processedAt: string;
  } | null;
  settlement: {
    id: string;
    status: string;
    netUsdc: number;
    grossUsdc: number;
    creditTxHash: string | null;
  } | null;
  paymentInstructions: InvoicePaymentInstructions;
  createdAt: string;
  updatedAt: string;
};

export type PublicInvoiceRecord = {
  invoiceNumber: string;
  publicToken: string;
  title: string;
  customerName: string;
  customerEmail: string;
  billingCurrency: string;
  status: InvoiceStatus;
  note: string | null;
  dueDate: string;
  issuedAt: string | null;
  paidAt: string | null;
  lineItems: InvoiceLineItem[];
  totals: {
    usdAmount: number;
    localAmount: number;
    fxRate: number;
    usdcAmount: number;
    feeAmount: number;
  };
  nextAction:
    | "none"
    | "complete_verification"
    | "create_payment"
    | "show_payment_instructions"
    | "wait_for_settlement"
    | "complete_test_payment";
  verification: {
    provider: string;
    status: string;
    country: string;
    currency: string;
    instructions: string;
    verificationHint: string | null;
    verificationMethods: Array<{
      method: string;
      hint: string | null;
    }>;
    requiredFields: string[];
  } | null;
  charge: {
    id: string;
    externalChargeId: string;
    status: string;
    failureCode: string | null;
    processedAt: string;
  } | null;
  settlement: {
    id: string;
    status: string;
    netUsdc: number;
    grossUsdc: number;
    creditTxHash: string | null;
    bridgeSourceTxHash: string | null;
    bridgeReceiveTxHash: string | null;
  } | null;
  paymentInstructions: InvoicePaymentInstructions;
  testMode: {
    enabled: boolean;
    canCompletePayment: boolean;
  };
};

export type InvoicePage = {
  invoices: InvoiceRecord[];
  pagination: ApiPagination;
};

function resolvePagination(
  pagination: ApiPagination | undefined,
  page: number,
  limit: number,
  count: number
) {
  return (
    pagination ?? {
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    }
  );
}

export async function loadInvoicesPage(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  status?: InvoiceStatus | "all";
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const response = await fetchApi<InvoiceRecord[]>("/invoices", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
      page: input.page,
      limit,
    },
  });

  return {
    invoices: response.data,
    pagination: resolvePagination(response.pagination, input.page, limit, response.data.length),
  } satisfies InvoicePage;
}

export async function createInvoice(input: {
  token: string;
  merchantId: string;
  environment: "test" | "live";
  title: string;
  customerName: string;
  customerEmail: string;
  billingCurrency: string;
  dueDate: string;
  note?: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmountUsd: number;
  }>;
  status?: "draft" | "issued";
}) {
  const response = await fetchApi<InvoiceRecord>("/invoices", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      environment: input.environment,
      title: input.title,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      billingCurrency: input.billingCurrency,
      dueDate: input.dueDate,
      note: input.note ?? null,
      lineItems: input.lineItems,
      status: input.status ?? "issued",
    }),
  });

  return response.data;
}

export async function updateInvoice(input: {
  token: string;
  invoiceId: string;
  merchantId: string;
  environment: "test" | "live";
  payload: Partial<{
    title: string;
    customerName: string;
    customerEmail: string;
    billingCurrency: string;
    dueDate: string;
    note: string | null;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitAmountUsd: number;
    }>;
    status: "draft" | "issued" | "void";
  }>;
}) {
  const response = await fetchApi<InvoiceRecord>(`/invoices/${input.invoiceId}`, {
    method: "PATCH",
    token: input.token,
    query: {
      merchantId: input.merchantId,
      environment: input.environment,
    },
    body: JSON.stringify(input.payload),
  });

  return response.data;
}

export async function sendInvoice(input: {
  token: string;
  invoiceId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<InvoiceRecord>(`/invoices/${input.invoiceId}/send`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function remindInvoice(input: {
  token: string;
  invoiceId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<InvoiceRecord>(`/invoices/${input.invoiceId}/remind`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function voidInvoice(input: {
  token: string;
  invoiceId: string;
  environment: "test" | "live";
}) {
  const response = await fetchApi<InvoiceRecord>(`/invoices/${input.invoiceId}/void`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      environment: input.environment,
    }),
  });

  return response.data;
}

export async function loadPublicInvoice(invoiceToken: string) {
  const response = await fetchApi<PublicInvoiceRecord>(`/invoices/public/${invoiceToken}`);
  return response.data;
}

export async function startPublicInvoicePayment(invoiceToken: string) {
  const response = await fetchApi<PublicInvoiceRecord>(
    `/invoices/public/${invoiceToken}/start-payment`,
    {
      method: "POST",
    }
  );

  return response.data;
}

export async function submitPublicInvoiceVerification(input: {
  invoiceToken: string;
  payload: {
    bvn?: string;
    verificationMethod?: string;
    phone?: string;
    otp?: string;
  };
}) {
  const response = await fetchApi<PublicInvoiceRecord>(
    `/invoices/public/${input.invoiceToken}/submit-verification`,
    {
      method: "POST",
      body: JSON.stringify(input.payload),
    }
  );

  return response.data;
}

export async function completePublicInvoiceTestPayment(invoiceToken: string) {
  const response = await fetchApi<PublicInvoiceRecord>(
    `/invoices/public/${invoiceToken}/test-complete-payment`,
    {
      method: "POST",
    }
  );

  return response.data;
}
