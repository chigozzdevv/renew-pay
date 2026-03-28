import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  RenewEnvironment,
  RenewCheckoutPlan,
  RenewCheckoutMarketQuote,
  RenewCheckoutSession,
  SubmitCheckoutCustomerInput,
  SubmitCheckoutVerificationInput,
} from "../types/checkout.js";
import { resolveRenewApiOrigin } from "../shared/environment.js";

type FetchImplementation = typeof fetch;

type RenewCheckoutClientConfig = {
  readonly apiOrigin?: string;
  readonly environment?: RenewEnvironment;
  readonly fetch?: FetchImplementation;
};

type SecretKeyOptions = {
  readonly secretKey: string;
};

type ClientSecretOptions = {
  readonly clientSecret: string;
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
      "Renew SDK requires a fetch implementation. Provide one in createRenewCheckoutClient({ fetch })."
    );
  }

  return implementation;
}

function resolveClientSecret(options: ClientSecretOptions) {
  const token = options.clientSecret?.trim();

  if (!token) {
    throw new Error("Renew checkout client requires a clientSecret.");
  }

  return token;
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
        truncateErrorMessage(rawText) ??
        `Renew API request failed with ${response.status}.`
    );
  }

  if (!payload || payload.data === undefined) {
    throw new Error("Renew API returned an invalid response payload.");
  }

  return payload.data;
}

function truncateErrorMessage(value: string, maxLength = 240) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

async function request<TData>(
  fetchImplementation: FetchImplementation,
  input: {
    readonly url: string;
    readonly method: "GET" | "POST";
    readonly headers?: Record<string, string>;
    readonly body?: Record<string, unknown>;
  }
) {
  const response = await fetchImplementation(input.url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      ...(input.headers ?? {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  return parseResponse<TData>(response);
}

export type RenewCheckoutClient = {
  listPlans(options: SecretKeyOptions): Promise<readonly RenewCheckoutPlan[]>;
  createSession(
    input: CreateCheckoutSessionInput,
    options: SecretKeyOptions
  ): Promise<CreateCheckoutSessionResult>;
  getSession(sessionId: string, options: ClientSecretOptions): Promise<RenewCheckoutSession>;
  quoteMarket(
    sessionId: string,
    market: string,
    options: ClientSecretOptions
  ): Promise<RenewCheckoutMarketQuote>;
  submitCustomer(
    sessionId: string,
    input: SubmitCheckoutCustomerInput,
    options: ClientSecretOptions
  ): Promise<RenewCheckoutSession>;
  submitVerification(
    sessionId: string,
    input: SubmitCheckoutVerificationInput,
    options: ClientSecretOptions
  ): Promise<RenewCheckoutSession>;
  completeTestPayment(
    sessionId: string,
    options: ClientSecretOptions
  ): Promise<RenewCheckoutSession>;
};

export function createRenewCheckoutClient(
  config: RenewCheckoutClientConfig
): RenewCheckoutClient {
  const apiOrigin = resolveRenewApiOrigin(config);
  const fetchImplementation = getFetchImplementation(config.fetch);

  return {
    async listPlans(options) {
      return request<readonly RenewCheckoutPlan[]>(fetchImplementation, {
        url: `${apiOrigin}/v1/checkout/plans`,
        method: "GET",
        headers: {
          "x-renew-secret-key": options.secretKey,
        },
      });
    },

    async createSession(input, options) {
      return request<CreateCheckoutSessionResult>(fetchImplementation, {
        url: `${apiOrigin}/v1/checkout/sessions`,
        method: "POST",
        headers: {
          "x-renew-secret-key": options.secretKey,
        },
        body: input,
      });
    },

    async getSession(sessionId, options) {
      return request<RenewCheckoutSession>(fetchImplementation, {
        url: `${apiOrigin}/v1/checkout/sessions/${sessionId}`,
        method: "GET",
        headers: {
          "x-renew-client-secret": resolveClientSecret(options),
        },
      });
    },

    async quoteMarket(sessionId, market, options) {
      const searchParams = new URLSearchParams({
        market,
      });

      return request<RenewCheckoutMarketQuote>(fetchImplementation, {
        url: `${apiOrigin}/v1/checkout/sessions/${sessionId}/quote?${searchParams.toString()}`,
        method: "GET",
        headers: {
          "x-renew-client-secret": resolveClientSecret(options),
        },
      });
    },

    async submitCustomer(sessionId, input, options) {
      return request<RenewCheckoutSession>(fetchImplementation, {
        url: `${apiOrigin}/v1/checkout/sessions/${sessionId}/customer`,
        method: "POST",
        headers: {
          "x-renew-client-secret": resolveClientSecret(options),
        },
        body: input,
      });
    },

    async submitVerification(sessionId, input, options) {
      return request<RenewCheckoutSession>(fetchImplementation, {
        url: `${apiOrigin}/v1/checkout/sessions/${sessionId}/verification`,
        method: "POST",
        headers: {
          "x-renew-client-secret": resolveClientSecret(options),
        },
        body: input,
      });
    },

    async completeTestPayment(sessionId, options) {
      return request<RenewCheckoutSession>(fetchImplementation, {
        url: `${apiOrigin}/v1/checkout/sessions/${sessionId}/test-complete`,
        method: "POST",
        headers: {
          "x-renew-client-secret": resolveClientSecret(options),
        },
      });
    },
  };
}
