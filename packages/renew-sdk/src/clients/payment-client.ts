import { resolveRenewApiOrigin } from "../shared/environment.js";
import type {
  CreateRenewCollectionInput,
  CreateRenewPaymentInput,
  ListRenewCollectionsQuery,
  ListRenewPaymentsQuery,
  RenewCollectionRecord,
  RenewEnvironment,
  RenewPaymentRecord,
  RenewPublicPaymentRecord,
  StartRenewPublicPaymentInput,
  UpdateRenewPaymentInput,
} from "../types/payment.js";

type FetchImplementation = typeof fetch;

type RenewPaymentClientConfig = {
  readonly apiOrigin?: string;
  readonly environment?: RenewEnvironment;
  readonly fetch?: FetchImplementation;
};

type SecretKeyOptions = {
  readonly secretKey: string;
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
      "Renew SDK requires a fetch implementation. Provide one in createRenewPaymentClient({ fetch })."
    );
  }

  return implementation;
}

function resolveSecretKey(options: SecretKeyOptions) {
  const token = options.secretKey.trim();

  if (!token) {
    throw new Error("Renew payment client requires a secretKey.");
  }

  return token;
}

function truncateErrorMessage(value: string, maxLength = 240) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
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

function buildUrl(
  apiOrigin: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return `${apiOrigin}/v1${path}${queryString ? `?${queryString}` : ""}`;
}

async function request<TData>(
  fetchImplementation: FetchImplementation,
  input: {
    readonly apiOrigin: string;
    readonly path: string;
    readonly method: "GET" | "POST" | "PATCH";
    readonly secretKey?: string;
    readonly query?: Record<string, string | number | boolean | undefined | null>;
    readonly body?: Record<string, unknown>;
  }
) {
  const response = await fetchImplementation(
    buildUrl(input.apiOrigin, input.path, input.query),
    {
      method: input.method,
      headers: {
        ...(input.body ? { "content-type": "application/json" } : {}),
        ...(input.secretKey ? { "x-renew-secret-key": input.secretKey } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    }
  );

  return parseResponse<TData>(response);
}

export type RenewPaymentClient = {
  createCollection(
    input: CreateRenewCollectionInput,
    options: SecretKeyOptions
  ): Promise<RenewCollectionRecord>;
  listCollections(
    query: ListRenewCollectionsQuery | undefined,
    options: SecretKeyOptions
  ): Promise<readonly RenewCollectionRecord[]>;
  getCollection(
    collectionId: string,
    options: SecretKeyOptions
  ): Promise<RenewCollectionRecord>;
  cancelCollection(
    collectionId: string,
    options: SecretKeyOptions
  ): Promise<RenewCollectionRecord>;
  createPayment(
    input: CreateRenewPaymentInput,
    options: SecretKeyOptions
  ): Promise<RenewPaymentRecord>;
  listPayments(
    query: ListRenewPaymentsQuery | undefined,
    options: SecretKeyOptions
  ): Promise<readonly RenewPaymentRecord[]>;
  getPayment(
    paymentId: string,
    options: SecretKeyOptions
  ): Promise<RenewPaymentRecord>;
  updatePayment(
    paymentId: string,
    input: UpdateRenewPaymentInput,
    options: SecretKeyOptions
  ): Promise<RenewPaymentRecord>;
  getPublicPayment(payId: string): Promise<RenewPublicPaymentRecord>;
  startPublicPayment(
    payId: string,
    input: StartRenewPublicPaymentInput
  ): Promise<RenewPublicPaymentRecord>;
};

export function createRenewPaymentClient(
  config: RenewPaymentClientConfig
): RenewPaymentClient {
  const apiOrigin = resolveRenewApiOrigin(config);
  const fetchImplementation = getFetchImplementation(config.fetch);

  return {
    createCollection(input, options) {
      return request<RenewCollectionRecord>(fetchImplementation, {
        apiOrigin,
        path: "/collections",
        method: "POST",
        secretKey: resolveSecretKey(options),
        body: {
          ...input,
          recurring: {
            enabled: input.recurring?.enabled ?? false,
            interval: input.recurring?.interval ?? null,
            intervalCount: input.recurring?.intervalCount ?? null,
            startsAt: input.recurring?.startsAt ?? null,
            endsAt: input.recurring?.endsAt ?? null,
          },
        },
      });
    },

    listCollections(query, options) {
      return request<readonly RenewCollectionRecord[]>(fetchImplementation, {
        apiOrigin,
        path: "/collections",
        method: "GET",
        secretKey: resolveSecretKey(options),
        query,
      });
    },

    getCollection(collectionId, options) {
      return request<RenewCollectionRecord>(fetchImplementation, {
        apiOrigin,
        path: `/collections/${encodeURIComponent(collectionId)}`,
        method: "GET",
        secretKey: resolveSecretKey(options),
      });
    },

    cancelCollection(collectionId, options) {
      return request<RenewCollectionRecord>(fetchImplementation, {
        apiOrigin,
        path: `/collections/${encodeURIComponent(collectionId)}/cancel`,
        method: "POST",
        secretKey: resolveSecretKey(options),
      });
    },

    createPayment(input, options) {
      return request<RenewPaymentRecord>(fetchImplementation, {
        apiOrigin,
        path: "/payments",
        method: "POST",
        secretKey: resolveSecretKey(options),
        body: {
          ...input,
          recurring: {
            enabled: input.recurring?.enabled ?? false,
            interval: input.recurring?.interval ?? null,
            intervalCount: input.recurring?.intervalCount ?? null,
            startsAt: input.recurring?.startsAt ?? null,
            endsAt: input.recurring?.endsAt ?? null,
          },
        },
      });
    },

    listPayments(query, options) {
      return request<readonly RenewPaymentRecord[]>(fetchImplementation, {
        apiOrigin,
        path: "/payments",
        method: "GET",
        secretKey: resolveSecretKey(options),
        query,
      });
    },

    getPayment(paymentId, options) {
      return request<RenewPaymentRecord>(fetchImplementation, {
        apiOrigin,
        path: `/payments/${encodeURIComponent(paymentId)}`,
        method: "GET",
        secretKey: resolveSecretKey(options),
      });
    },

    updatePayment(paymentId, input, options) {
      return request<RenewPaymentRecord>(fetchImplementation, {
        apiOrigin,
        path: `/payments/${encodeURIComponent(paymentId)}`,
        method: "PATCH",
        secretKey: resolveSecretKey(options),
        body: input,
      });
    },

    getPublicPayment(payId) {
      return request<RenewPublicPaymentRecord>(fetchImplementation, {
        apiOrigin,
        path: `/pay/${encodeURIComponent(payId)}`,
        method: "GET",
      });
    },

    startPublicPayment(payId, input) {
      return request<RenewPublicPaymentRecord>(fetchImplementation, {
        apiOrigin,
        path: `/pay/${encodeURIComponent(payId)}/start`,
        method: "POST",
        body: input,
      });
    },
  };
}
