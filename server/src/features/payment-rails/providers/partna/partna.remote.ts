import { HttpError } from "@/shared/errors/http-error";

import { getPartnaConfig } from "@/config/partna.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import type {
  PartnaManagedAccountInput,
  PartnaManagedBankAccount,
  PartnaMockPaymentInput,
  PartnaProvider,
  PartnaRedeemVoucherInput,
  PartnaVoucherInput,
  PartnaVoucherRecord,
} from "@/features/payment-rails/providers/partna/partna.types";

type HttpMethod = "GET" | "POST" | "PATCH";

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function extractPayloadData(payload: unknown) {
  const record = asRecord(payload);

  if (!record) {
    return {};
  }

  const data = asRecord(record.data);
  return data ?? record;
}

function extractManagedBankAccount(record: Record<string, unknown>): PartnaManagedBankAccount {
  return {
    provider: "partna",
    accountName:
      readString(record.accountName) ??
      readString(record.name) ??
      readString(record.fullname) ??
      "renew-account",
    bankCode: readString(record.bankCode),
    bankName: readString(record.bankName) ?? readString(record.bank),
    accountNumber:
      readString(record.accountNumber) ?? readString(record.accountnumber),
    currency: readString(record.currency)?.toUpperCase() ?? "NGN",
    email: readString(record.email) ?? "",
    fullName:
      readString(record.fullName) ??
      readString(record.fullname) ??
      readString(record.accountName) ??
      "",
    raw: record,
  };
}

function extractVoucherRecord(record: Record<string, unknown>): PartnaVoucherRecord {
  return {
    provider: "partna",
    voucherId:
      readString(record.id) ??
      readString(record.voucherId) ??
      readString(record.reference) ??
      `partna-voucher-${Date.now()}`,
    voucherCode: readString(record.voucherCode) ?? readString(record.code),
    status: readString(record.status)?.toLowerCase() ?? "pending",
    amount: readNumber(record.amount) ?? 0,
    fee: readNumber(record.fee),
    currency: readString(record.currency)?.toUpperCase() ?? "NGN",
    email: readString(record.email) ?? "",
    fullName:
      readString(record.fullName) ??
      readString(record.fullname) ??
      readString(record.accountName) ??
      "",
    reference: readString(record.reference) ?? readString(record.id),
    paymentUrl: readString(record.paymentUrl) ?? readString(record.payUrl),
    raw: record,
  };
}

export class PartnaRemoteProvider implements PartnaProvider {
  private readonly config;

  constructor(mode: RuntimeMode) {
    this.config = getPartnaConfig(mode);
  }

  private assertConfigured() {
    if (!this.config.apiKey || !this.config.apiUser) {
      throw new HttpError(
        500,
        `Partna is not configured for ${this.config.mode}.`
      );
    }
  }

  private async requestJson(
    baseUrl: string,
    path: string,
    method: HttpMethod,
    body?: Record<string, unknown>,
    searchParams?: URLSearchParams
  ) {
    this.assertConfigured();

    if (!baseUrl) {
      throw new HttpError(
        500,
        `Partna base URL is not configured for ${this.config.mode}.`
      );
    }

    const url = new URL(`${baseUrl.replace(/\/+$/g, "")}${path}`);

    if (searchParams) {
      url.search = searchParams.toString();
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        "x-api-user": this.config.apiUser,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    const raw = await response.text();
    let payload: unknown = {};

    if (raw.trim().length > 0) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { raw };
      }
    }

    if (!response.ok) {
      const message =
        readString(asRecord(payload)?.message) ??
        readString(asRecord(payload)?.error) ??
        `Partna request failed with ${response.status}.`;

      throw new HttpError(response.status, message ?? "Partna request failed.");
    }

    return payload;
  }

  async createManagedBankAccount(input: PartnaManagedAccountInput) {
    const payload = await this.requestJson(
      this.config.vouchersBaseUrl,
      "/accounts/create-account",
      "POST",
      {
        email: input.email,
        fullName: input.fullName,
        firstName: input.firstName,
        middleName: input.middleName ?? undefined,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? undefined,
        addressLine3: input.addressLine3 ?? undefined,
        phoneNumber: input.phoneNumber,
        country: input.country,
        currency: input.currency,
        bvn: input.bvn,
        stateOfOrigin: input.stateOfOrigin,
        stateOfResidence: input.stateOfResidence,
        lgaOfOrigin: input.lgaOfOrigin,
        lgaOfResidence: input.lgaOfResidence,
        callbackurl: input.callbackUrl ?? undefined,
      }
    );

    return extractManagedBankAccount(extractPayloadData(payload));
  }

  async listStaticBankAccounts(email: string) {
    const payload = await this.requestJson(
      this.config.vouchersBaseUrl,
      "/accounts",
      "GET",
      undefined,
      new URLSearchParams({ email })
    );

    const data = extractPayloadData(payload);
    const collection =
      (Array.isArray(data.accounts) ? data.accounts : null) ??
      (Array.isArray(data.data) ? data.data : null) ??
      (Array.isArray(data) ? data : null) ??
      [];

    return collection
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map(extractManagedBankAccount);
  }

  async createVoucher(input: PartnaVoucherInput) {
    const payload = await this.requestJson(
      this.config.vouchersBaseUrl,
      "/vouchers",
      "POST",
      {
        email: input.email,
        fullname: input.fullName,
        amount: input.amount,
        merchant: input.merchant,
      }
    );

    return extractVoucherRecord(extractPayloadData(payload));
  }

  async redeemVoucherAndWithdraw(input: PartnaRedeemVoucherInput) {
    const payload = await this.requestJson(
      this.config.vouchersBaseUrl,
      "/voucher/redeem-and-withdraw",
      "PATCH",
      {
        email: input.email,
        voucherCode: input.voucherCode,
        currency: input.currency,
        network: input.network,
        cryptoAddress: input.cryptoAddress,
      }
    );

    return extractPayloadData(payload);
  }

  async makeMockPayment(input: PartnaMockPaymentInput) {
    const payload = await this.requestJson(
      this.config.vouchersBaseUrl,
      "/mock-payment",
      "POST",
      {
        accountNumber: input.accountNumber,
        paymentAmount: input.paymentAmount,
        currency: input.currency,
        reference: input.reference,
      }
    );

    return extractPayloadData(payload);
  }
}
