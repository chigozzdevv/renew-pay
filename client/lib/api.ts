export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data: T;
  pagination?: ApiPagination;
};

export type ApiPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export const accessTokenStorageKey = "renew:platform-access-token";
export const workspaceModeStorageKey = "renew:workspace-mode";
export type WorkspaceMode = "test" | "live";

export function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
    "https://pay.renew.sh/v1"
  );
}

export function getApiOrigin() {
  return getApiBaseUrl().replace(/\/v1$/, "");
}

export function readAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  const token = window.localStorage.getItem(accessTokenStorageKey);
  return token?.trim() ? token.trim() : null;
}

export function readWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") {
    return "test";
  }

  return window.localStorage.getItem(workspaceModeStorageKey) === "live"
    ? "live"
    : "test";
}

export function clearAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(accessTokenStorageKey);
}

export async function fetchApi<T>(
  path: string,
  init: RequestInit & {
    token?: string | null;
    query?: Record<string, string | number | boolean | undefined | null>;
  } = {}
) {
  const { token, query, headers, body, ...rest } = init;
  const queryString = query
    ? new URLSearchParams(
        Object.entries(query).flatMap(([key, value]) =>
          value === undefined || value === null ? [] : [[key, String(value)]]
        )
      ).toString()
    : "";
  const url = `${getApiBaseUrl()}${path}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
    cache: "no-store",
  });

  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.message ?? "Request failed."
    );
  }

  if (!payload) {
    throw new ApiError(response.status, "Empty response payload.");
  }

  return payload;
}
