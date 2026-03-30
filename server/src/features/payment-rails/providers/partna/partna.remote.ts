import { HttpError } from "@/shared/errors/http-error";

import { getPartnaConfig } from "@/config/partna.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import type {
  PartnaAccountDetailsInput,
  PartnaAccountDetailsRecord,
  PartnaAccountKycDetails,
  PartnaBvnVerificationMethod,
  PartnaConfirmBvnOtpInput,
  PartnaCreateAccountInput,
  PartnaCreateBankAccountInput,
  PartnaHandleBvnOtpMethodInput,
  PartnaInitiateBvnKycInput,
  PartnaManagedBankAccount,
  PartnaMockPaymentInput,
  PartnaProvider,
  PartnaRateInput,
  PartnaRateQuote,
  PartnaRedeemVoucherInput,
  PartnaSupportedAsset,
  PartnaVoucherInput,
  PartnaVoucherRecord,
} from "@/features/payment-rails/providers/partna/partna.types";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT";

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

function readDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
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

function extractPartnaErrorDetail(payload: unknown) {
  const data = extractPayloadData(payload);

  if (Array.isArray(data)) {
    const firstMessage = data.find(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
    );

    if (firstMessage) {
      return firstMessage.trim();
    }
  }

  return null;
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

function extractManagedBankAccountPayload(payload: unknown) {
  const data = extractPayloadData(payload);
  const record = Array.isArray(data) ? asRecord(data[0]) : asRecord(data);

  if (!record) {
    throw new HttpError(502, "Partna bank account response did not include an account.");
  }

  return extractManagedBankAccount(record);
}

function extractBvnVerificationMethods(payload: unknown) {
  const data = extractPayloadData(payload);
  const methods = Array.isArray(data.methods) ? data.methods : [];

  return methods
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map(
      (entry): PartnaBvnVerificationMethod => ({
        method: readString(entry.method) ?? "",
        hint: readString(entry.hint),
      })
    )
    .filter((entry) => entry.method.length > 0);
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
    wavedFee: readNumber(record.wavedFee),
    feeBearer: readString(record.feeBearer)?.toLowerCase() ?? null,
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

function extractSupportedAssets(payload: unknown) {
  const data = extractPayloadData(payload);
  const byCurrency = asRecord(data.byCurrency) ?? {};
  const assets: PartnaSupportedAsset[] = [];

  for (const [currency, networkMapValue] of Object.entries(byCurrency)) {
    const networkMap = asRecord(networkMapValue);

    if (!networkMap) {
      continue;
    }

    for (const [network, assetValue] of Object.entries(networkMap)) {
      const asset = asRecord(assetValue);

      if (!asset) {
        continue;
      }

      assets.push({
        currency: currency.trim().toUpperCase(),
        network: network.trim().toLowerCase(),
        destinationCurrency:
          readString(asset.destinationCurrency)?.toUpperCase() ??
          currency.trim().toUpperCase(),
        name: readString(asset.name) ?? currency.trim().toUpperCase(),
        symbol:
          readString(asset.symbol)?.toUpperCase() ??
          currency.trim().toUpperCase(),
        decimals: readNumber(asset.decimals),
        minimumWithdrawal: readNumber(asset.minimumWithdrawal),
        raw: asset,
      });
    }
  }

  return assets;
}

function extractRateQuote(
  payload: unknown,
  input: PartnaRateInput
): PartnaRateQuote {
  const data = extractPayloadData(payload);
  const rateMap = asRecord(data.rate) ?? asRecord(data.rates) ?? asRecord(data);
  const normalizedFrom = input.fromCurrency.trim().toUpperCase();
  const normalizedTo = input.toCurrency.trim().toUpperCase();
  const preferredKey = `${normalizedFrom}_to_${normalizedTo}`;
  const preferredRate =
    asRecord(rateMap?.[preferredKey]) ??
    Object.values(rateMap ?? {})
      .map((entry) => asRecord(entry))
      .find((entry): entry is Record<string, unknown> => Boolean(entry));

  if (!preferredRate) {
    throw new HttpError(502, "Partna rate response did not include a usable quote.");
  }

  let fromAmount =
    readNumber(preferredRate.fromAmount) ??
    (input.fromAmount !== undefined ? Number(input.fromAmount) : null);
  let toAmount =
    readNumber(preferredRate.toAmount) ??
    (input.toAmount !== undefined ? Number(input.toAmount) : null);
  let rate = readNumber(preferredRate.rate);

  if (rate === null && fromAmount && toAmount) {
    rate = toAmount / fromAmount;
  }

  if (fromAmount === null && toAmount !== null && rate) {
    fromAmount = toAmount / rate;
  }

  if (toAmount === null && fromAmount !== null && rate) {
    toAmount = fromAmount * rate;
  }

  if (fromAmount === null || toAmount === null || rate === null) {
    throw new HttpError(502, "Partna rate response is missing conversion amounts.");
  }

  return {
    key: readString(preferredRate.key),
    fromCurrency:
      readString(preferredRate.fromCurrency)?.toUpperCase() ?? normalizedFrom,
    toCurrency:
      readString(preferredRate.toCurrency)?.toUpperCase() ?? normalizedTo,
    fromAmount,
    toAmount,
    rate,
    raw: preferredRate,
  };
}

function extractAccountKycDetails(
  record: Record<string, unknown> | null
): PartnaAccountKycDetails | null {
  if (!record) {
    return null;
  }

  return {
    firstName: readString(record.first_name) ?? readString(record.firstName),
    middleName: readString(record.middle_name) ?? readString(record.middleName),
    lastName: readString(record.last_name) ?? readString(record.lastName),
    dateOfBirth: readString(record.dob) ?? readString(record.dateOfBirth),
    addressLine1:
      readString(record.address_line_1) ?? readString(record.addressLine1),
    addressLine2:
      readString(record.address_line_2) ?? readString(record.addressLine2),
    stateOfResidence:
      readString(record.state_of_residence) ?? readString(record.stateOfResidence),
    lgaOfResidence:
      readString(record.lga_of_residence) ?? readString(record.lgaOfResidence),
    raw: record,
  };
}

function extractAccountDetailsRecord(
  record: Record<string, unknown>
): PartnaAccountDetailsRecord {
  const bankDetails = asRecord(record.bankDetails);

  return {
    accountName:
      readString(bankDetails?.account_name) ??
      readString(bankDetails?.accountName) ??
      readString(record.accountName),
    accountNumber:
      readString(bankDetails?.account_number) ??
      readString(bankDetails?.accountNumber),
    bankCode:
      readString(bankDetails?.bank_code) ??
      readString(bankDetails?.bankCode),
    bankName:
      readString(bankDetails?.bank_name) ??
      readString(bankDetails?.bankName),
    email: readString(record.email),
    externalRef: readString(record.externalRef),
    createdAt: readDate(record.createdAt) ?? readDate(bankDetails?.createdAt),
    kycDetails: extractAccountKycDetails(asRecord(record.kycDetails)),
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
      const detail = extractPartnaErrorDetail(payload);

      throw new HttpError(
        response.status,
        detail && detail !== message ? `${message}: ${detail}` : message ?? "Partna request failed."
      );
    }

    return payload;
  }

  async createAccount(input: PartnaCreateAccountInput) {
    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/account",
      "POST",
      {
        accountName: input.accountName,
      }
    );

    return extractPayloadData(payload);
  }

  async initiateBvnKyc(input: PartnaInitiateBvnKycInput) {
    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/kyc",
      "POST",
      {
        accountName: input.accountName,
        bvn: input.bvn,
        kesMobileNetwork: input.kesMobileNetwork ?? undefined,
        kesShortcode: input.kesShortcode ?? undefined,
      }
    );

    return extractBvnVerificationMethods(payload);
  }

  async handleBvnOtpMethod(input: PartnaHandleBvnOtpMethodInput) {
    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/kyc/handle-otp",
      "PUT",
      {
        accountName: input.accountName,
        verificationMethod: input.verificationMethod,
        accountNumber: input.accountNumber ?? undefined,
        bankCode: input.bankCode ?? undefined,
      }
    );

    return extractPayloadData(payload);
  }

  async confirmBvnOtp(input: PartnaConfirmBvnOtpInput) {
    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/kyc/confirm-otp",
      "PUT",
      {
        accountName: input.accountName,
        currency: input.currency.trim().toUpperCase(),
        otp: input.otp.trim(),
      }
    );

    return extractPayloadData(payload);
  }

  async createBankAccount(input: PartnaCreateBankAccountInput) {
    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/account",
      "PUT",
      {
        accountName: input.accountName,
        currency: input.currency.trim().toUpperCase(),
        preferredAccountName: input.preferredAccountName ?? undefined,
      }
    );

    return extractManagedBankAccountPayload(payload);
  }

  async listStaticBankAccounts(email: string) {
    const payload = await this.requestJson(
      this.config.vouchersBaseUrl,
      "/get-accounts",
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

  async listSupportedAssets() {
    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/supported/assets",
      "GET"
    );

    return extractSupportedAssets(payload);
  }

  async getRate(input: PartnaRateInput) {
    const searchParams = new URLSearchParams({
      fromCurrency: input.fromCurrency.trim().toUpperCase(),
      toCurrency: input.toCurrency.trim().toUpperCase(),
    });

    if (input.fromAmount !== undefined) {
      searchParams.set("fromAmount", String(input.fromAmount));
    }

    if (input.toAmount !== undefined) {
      searchParams.set("toAmount", String(input.toAmount));
    }

    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/rate",
      "GET",
      undefined,
      searchParams
    );

    return extractRateQuote(payload, input);
  }

  async getAccountDetails(input: PartnaAccountDetailsInput = {}) {
    const searchParams = new URLSearchParams();

    if (input.accountName?.trim()) {
      searchParams.set("accountName", input.accountName.trim());
    }

    if (input.page !== undefined) {
      searchParams.set("page", String(input.page));
    }

    if (input.perPage !== undefined) {
      searchParams.set("perPage", String(input.perPage));
    }

    const payload = await this.requestJson(
      this.config.v4BaseUrl,
      "/account/account-details",
      "GET",
      undefined,
      searchParams
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
      .map(extractAccountDetailsRecord);
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
