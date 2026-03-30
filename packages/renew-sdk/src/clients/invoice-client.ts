import type {
  RenewPublicInvoiceRecord,
  SubmitPublicInvoiceVerificationInput,
} from "../types/invoice.js";
import { resolveRenewApiOrigin } from "../shared/environment.js";

type FetchImplementation = typeof fetch;

type RenewInvoiceClientConfig = {
  readonly apiOrigin?: string;
  readonly environment?: "sandbox" | "live";
  readonly fetch?: FetchImplementation;
};

type ApiEnvelope<TData> = {
  readonly success: boolean;
  readonly message?: string;
  readonly data: TData;
};

function getFetchImplementation(value?: FetchImplementation) {
  const implementation = value ?? globalThis.fetch;

  if (!implementation) {
    throw new Error(
      "Renew SDK requires a fetch implementation. Provide one in createRenewInvoiceClient({ fetch })."
    );
  }

  return implementation;
}

async function parseResponse<TData>(response: Response) {
  const rawText = await response.text();
  let payload: (Partial<ApiEnvelope<TData>> & { message?: string }) | null = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as Partial<ApiEnvelope<TData>> & {
        message?: string;
      };
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        rawText.trim() ??
        `Renew API request failed with ${response.status}.`
    );
  }

  if (!payload || payload.data === undefined) {
    throw new Error("Renew API returned an invalid response payload.");
  }

  return payload.data;
}

async function request<TData>(
  fetchImplementation: FetchImplementation,
  input: {
    readonly url: string;
    readonly method: "GET" | "POST";
    readonly body?: Record<string, unknown>;
  }
) {
  const response = await fetchImplementation(input.url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  return parseResponse<TData>(response);
}

export type RenewInvoiceClient = {
  getInvoice(invoiceToken: string): Promise<RenewPublicInvoiceRecord>;
  startPayment(invoiceToken: string): Promise<RenewPublicInvoiceRecord>;
  submitVerification(
    invoiceToken: string,
    input: SubmitPublicInvoiceVerificationInput
  ): Promise<RenewPublicInvoiceRecord>;
  completeTestPayment(invoiceToken: string): Promise<RenewPublicInvoiceRecord>;
};

export function createRenewInvoiceClient(
  config: RenewInvoiceClientConfig
): RenewInvoiceClient {
  const apiOrigin = resolveRenewApiOrigin(config);
  const fetchImplementation = getFetchImplementation(config.fetch);

  return {
    async getInvoice(invoiceToken) {
      return request<RenewPublicInvoiceRecord>(fetchImplementation, {
        url: `${apiOrigin}/v1/invoices/public/${invoiceToken}`,
        method: "GET",
      });
    },

    async startPayment(invoiceToken) {
      return request<RenewPublicInvoiceRecord>(fetchImplementation, {
        url: `${apiOrigin}/v1/invoices/public/${invoiceToken}/start-payment`,
        method: "POST",
      });
    },

    async submitVerification(invoiceToken, input) {
      return request<RenewPublicInvoiceRecord>(fetchImplementation, {
        url: `${apiOrigin}/v1/invoices/public/${invoiceToken}/submit-verification`,
        method: "POST",
        body: input,
      });
    },

    async completeTestPayment(invoiceToken) {
      return request<RenewPublicInvoiceRecord>(fetchImplementation, {
        url: `${apiOrigin}/v1/invoices/public/${invoiceToken}/test-complete-payment`,
        method: "POST",
      });
    },
  };
}
