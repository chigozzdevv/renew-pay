import { getYellowCardConfig } from "@/config/yellow-card.config";
import { HttpError } from "@/shared/errors/http-error";
import type {
  CreateWidgetQuoteInput,
  ResolveBankAccountInput,
} from "@/features/payment-rails/payment-rails.validation";
import type { YellowCardProvider } from "@/features/payment-rails/providers/yellow-card/yellow-card.types";
import type { YellowCardCollectionRequestInput } from "@/features/payment-rails/providers/yellow-card/yellow-card.types";
import type {
  YellowCardChannel,
  YellowCardNetwork,
} from "@/features/payment-rails/providers/yellow-card/yellow-card.types";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export class YellowCardLiveProvider implements YellowCardProvider {
  private readonly config: ReturnType<typeof getYellowCardConfig>;

  constructor(mode: RuntimeMode = "live") {
    this.config = getYellowCardConfig(mode);
  }

  async getChannels(country?: string) {
    const searchParams = new URLSearchParams();

    if (country) {
      searchParams.set("country", country);
    }

    return this.requestJson<YellowCardChannel[]>(
      `/channels${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
    );
  }

  async getNetworks(country?: string) {
    const searchParams = new URLSearchParams();

    if (country) {
      searchParams.set("country", country);
    }

    return this.requestJson<YellowCardNetwork[]>(
      `/networks${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
    );
  }

  async getWidgetQuote(input: CreateWidgetQuoteInput) {
    return this.requestJson<Record<string, unknown>>("/widget/quote", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async resolveBankAccount(input: ResolveBankAccountInput) {
    return this.requestJson<Record<string, unknown>>("/details/bank", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async submitCollectionRequest(input: YellowCardCollectionRequestInput) {
    return this.requestJson<Record<string, unknown>>("/collections", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getCollectionById(collectionId: string) {
    return this.requestJson<Record<string, unknown>>(`/collections/${collectionId}`);
  }

  async acceptCollectionRequest(collectionId: string) {
    return this.requestJson<Record<string, unknown>>(`/collections/${collectionId}/accept`, {
      method: "POST",
    });
  }

  async denyCollectionRequest(collectionId: string) {
    return this.requestJson<Record<string, unknown>>(`/collections/${collectionId}/deny`, {
      method: "POST",
    });
  }

  private async requestJson<T>(
    path: string,
    options?: {
      method?: "GET" | "POST";
      body?: string;
    }
  ) {
    if (!this.config.apiKey) {
      throw new HttpError(
        500,
        "Yellow Card credentials are missing for live provider configuration."
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method: options?.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.config.apiKey,
          [this.config.timestampHeader]: new Date().toISOString(),
        },
        body: options?.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(
          `Yellow Card request failed with status ${response.status}: ${message}`
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
