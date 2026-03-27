import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { normalizeSolanaAddress } from "@/shared/constants/solana";

import { appendAuditLog } from "@/features/audit/audit.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import { SettingModel } from "@/features/settings/setting.model";
import {
  createPayoutWalletConfirmOperation,
  createReserveClearOperation,
  createReservePromoteOperation,
  createWalletUpdateOperations,
  getTreasuryByMerchantId,
} from "@/features/treasury/treasury.service";
import type {
  SaveWalletInput,
  UpdateSettingsInput,
  WalletActionInput,
} from "@/features/settings/setting.validation";

function toSettingResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  businessName: string;
  supportEmail: string;
  defaultMarket: string;
  invoicePrefix: string;
  billingTimezone: string;
  billingDisplay: string;
  fallbackCurrency: string;
  statementDescriptor: string;
  brandAccent: string;
  emailLogoUrl?: string | null;
  customerDomain: string;
  invoiceFooter: string;
  retryPolicy: string;
  invoiceGraceDays: number;
  autoRetries: boolean;
  meterApproval: boolean;
  primaryWallet: string;
  reserveWallet?: string | null;
  walletAlerts: boolean;
  financeDigest: boolean;
  developerAlerts: boolean;
  loginAlerts: boolean;
  customerSubscriptionEmails?: boolean;
  customerReceiptEmails?: boolean;
  customerPaymentFollowUps?: boolean;
  merchantSubscriptionAlerts?: boolean;
  merchantPaymentDigestFrequency?: string;
  merchantPaymentDigestMode?: string;
  teamInviteEmails?: boolean;
  governanceAlerts?: boolean;
  treasuryAlerts?: boolean;
  verificationAlerts?: boolean;
  securityAlerts?: boolean;
  sessionTimeout: string;
  inviteDomainPolicy: string;
  enforceTwoFactor: boolean;
  restrictInviteDomains: boolean;
  createdAt: Date;
  updatedAt: Date;
},
treasury?: {
  account: {
    governanceVaultAddress: string;
    payoutWallet: string;
    reserveWallet?: string | null;
    threshold: number;
    pendingPayoutWallet?: string | null;
    payoutWalletChangeReadyAt?: Date | null;
  } | null;
  operations: Array<{
    id: string;
    kind: string;
    status: string;
  }>;
}) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    profile: {
      businessName: document.businessName,
      supportEmail: document.supportEmail,
      defaultMarket: document.defaultMarket,
      invoicePrefix: document.invoicePrefix,
      billingTimezone: document.billingTimezone,
      billingDisplay: document.billingDisplay,
      fallbackCurrency: document.fallbackCurrency,
      statementDescriptor: document.statementDescriptor,
      brandAccent: document.brandAccent,
      emailLogoUrl: document.emailLogoUrl ?? null,
      customerDomain: document.customerDomain,
      invoiceFooter: document.invoiceFooter,
    },
    billing: {
      retryPolicy: document.retryPolicy,
      invoiceGraceDays: document.invoiceGraceDays,
      autoRetries: document.autoRetries,
      meterApproval: document.meterApproval,
    },
    wallets: {
      primaryWallet: treasury?.account?.payoutWallet ?? document.primaryWallet,
      reserveWallet: treasury?.account?.reserveWallet ?? document.reserveWallet ?? null,
      walletAlerts: document.walletAlerts,
      governanceVaultAddress: treasury?.account?.governanceVaultAddress ?? null,
      pendingPayoutWallet: treasury?.account?.pendingPayoutWallet ?? null,
      payoutWalletChangeReadyAt:
        treasury?.account?.payoutWalletChangeReadyAt ?? null,
    },
    notifications: {
      customerSubscriptionEmails: document.customerSubscriptionEmails ?? true,
      customerReceiptEmails: document.customerReceiptEmails ?? true,
      customerPaymentFollowUps: document.customerPaymentFollowUps ?? true,
      merchantSubscriptionAlerts: document.merchantSubscriptionAlerts ?? true,
      merchantPaymentDigestFrequency:
        document.merchantPaymentDigestFrequency ??
        (document.financeDigest === false ? "off" : "daily"),
      merchantPaymentDigestMode: document.merchantPaymentDigestMode ?? "counts",
      teamInviteEmails: document.teamInviteEmails ?? true,
      governanceAlerts: document.governanceAlerts ?? true,
      treasuryAlerts: document.treasuryAlerts ?? true,
      verificationAlerts: document.verificationAlerts ?? true,
      developerAlerts: document.developerAlerts,
      securityAlerts: document.securityAlerts ?? document.loginAlerts ?? true,
    },
    security: {
      sessionTimeout: document.sessionTimeout,
      inviteDomainPolicy: document.inviteDomainPolicy,
      enforceTwoFactor: document.enforceTwoFactor,
      restrictInviteDomains: document.restrictInviteDomains,
    },
    treasury: {
      threshold: treasury?.account?.threshold ?? 0,
      pendingOperations: treasury?.operations ?? [],
    },
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function getMerchantOrThrow(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

async function getOrCreateSetting(merchantId: string) {
  const [merchant, setting] = await Promise.all([
    getMerchantOrThrow(merchantId),
    getOrCreateMerchantSetting(merchantId),
  ]);

  return { merchant, setting };
}

export async function getSettingsByMerchantId(
  merchantId: string,
  environment: RuntimeMode = "test"
) {
  const { setting } = await getOrCreateSetting(merchantId);
  const treasury = await getTreasuryByMerchantId(merchantId, environment).catch(() => ({
    account: null,
    signers: [],
    operations: [],
  }));

  return toSettingResponse(setting, {
    account: treasury.account
      ? {
          governanceVaultAddress: treasury.account.governanceVaultAddress,
          payoutWallet: treasury.account.payoutWallet,
          reserveWallet: treasury.account.reserveWallet,
          threshold: treasury.account.threshold,
          pendingPayoutWallet: treasury.account.pendingPayoutWallet,
          payoutWalletChangeReadyAt: treasury.account.payoutWalletChangeReadyAt,
        }
      : null,
    operations: treasury.operations.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
    })),
  });
}

export async function updateSettingsByMerchantId(
  merchantId: string,
  input: UpdateSettingsInput
) {
  const { merchant, setting } = await getOrCreateSetting(merchantId);

  const mutatesWallets =
    input.wallets !== undefined &&
    (input.wallets.primaryWallet !== undefined ||
      input.wallets.reserveWallet !== undefined);

  if (mutatesWallets) {
    await assertMerchantKybApprovedForLive(
      merchantId,
      "changing treasury wallets",
      input.environment
    );
  }

  if (input.profile) {
    if (input.profile.businessName !== undefined) {
      setting.businessName = input.profile.businessName;
      merchant.name = input.profile.businessName;
    }

    if (input.profile.supportEmail !== undefined) {
      setting.supportEmail = input.profile.supportEmail;
      merchant.supportEmail = input.profile.supportEmail;
    }

    if (input.profile.defaultMarket !== undefined) {
      if (!merchant.supportedMarkets.includes(input.profile.defaultMarket)) {
        throw new HttpError(
          409,
          `Default market ${input.profile.defaultMarket} is not enabled for this merchant.`
        );
      }
      setting.defaultMarket = input.profile.defaultMarket;
    }

    if (input.profile.invoicePrefix !== undefined) {
      setting.invoicePrefix = input.profile.invoicePrefix;
    }

    if (input.profile.billingTimezone !== undefined) {
      setting.billingTimezone = input.profile.billingTimezone;
      merchant.billingTimezone = input.profile.billingTimezone;
    }

    if (input.profile.billingDisplay !== undefined) {
      setting.billingDisplay = input.profile.billingDisplay;
    }

    if (input.profile.fallbackCurrency !== undefined) {
      setting.fallbackCurrency = input.profile.fallbackCurrency;
    }

    if (input.profile.statementDescriptor !== undefined) {
      setting.statementDescriptor = input.profile.statementDescriptor;
    }

    if (input.profile.brandAccent !== undefined) {
      setting.brandAccent = input.profile.brandAccent;
    }

    if (input.profile.emailLogoUrl !== undefined) {
      setting.emailLogoUrl = input.profile.emailLogoUrl;
    }

    if (input.profile.customerDomain !== undefined) {
      setting.customerDomain = input.profile.customerDomain;
    }

    if (input.profile.invoiceFooter !== undefined) {
      setting.invoiceFooter = input.profile.invoiceFooter;
    }
  }

  if (input.billing) {
    if (input.billing.retryPolicy !== undefined) {
      setting.retryPolicy = input.billing.retryPolicy;
    }

    if (input.billing.invoiceGraceDays !== undefined) {
      setting.invoiceGraceDays = input.billing.invoiceGraceDays;
    }

    if (input.billing.autoRetries !== undefined) {
      setting.autoRetries = input.billing.autoRetries;
    }

    if (input.billing.meterApproval !== undefined) {
      setting.meterApproval = input.billing.meterApproval;
    }
  }

  if (input.wallets) {
    if (input.wallets.walletAlerts !== undefined) {
      setting.walletAlerts = input.wallets.walletAlerts;
    }
  }

  if (input.notifications) {
    if (input.notifications.customerSubscriptionEmails !== undefined) {
      setting.customerSubscriptionEmails = input.notifications.customerSubscriptionEmails;
    }

    if (input.notifications.customerReceiptEmails !== undefined) {
      setting.customerReceiptEmails = input.notifications.customerReceiptEmails;
    }

    if (input.notifications.customerPaymentFollowUps !== undefined) {
      setting.customerPaymentFollowUps = input.notifications.customerPaymentFollowUps;
    }

    if (input.notifications.merchantSubscriptionAlerts !== undefined) {
      setting.merchantSubscriptionAlerts = input.notifications.merchantSubscriptionAlerts;
    }

    if (input.notifications.merchantPaymentDigestFrequency !== undefined) {
      setting.merchantPaymentDigestFrequency =
        input.notifications.merchantPaymentDigestFrequency;
      setting.financeDigest = input.notifications.merchantPaymentDigestFrequency !== "off";
    }

    if (input.notifications.merchantPaymentDigestMode !== undefined) {
      setting.merchantPaymentDigestMode = input.notifications.merchantPaymentDigestMode;
    }

    if (input.notifications.teamInviteEmails !== undefined) {
      setting.teamInviteEmails = input.notifications.teamInviteEmails;
    }

    if (input.notifications.governanceAlerts !== undefined) {
      setting.governanceAlerts = input.notifications.governanceAlerts;
    }

    if (input.notifications.treasuryAlerts !== undefined) {
      setting.treasuryAlerts = input.notifications.treasuryAlerts;
    }

    if (input.notifications.verificationAlerts !== undefined) {
      setting.verificationAlerts = input.notifications.verificationAlerts;
    }

    if (input.notifications.developerAlerts !== undefined) {
      setting.developerAlerts = input.notifications.developerAlerts;
    }

    if (input.notifications.securityAlerts !== undefined) {
      setting.securityAlerts = input.notifications.securityAlerts;
      setting.loginAlerts = input.notifications.securityAlerts;
    }
  }

  if (input.security) {
    if (input.security.sessionTimeout !== undefined) {
      setting.sessionTimeout = input.security.sessionTimeout;
    }

    if (input.security.inviteDomainPolicy !== undefined) {
      setting.inviteDomainPolicy = input.security.inviteDomainPolicy;
    }

    if (input.security.enforceTwoFactor !== undefined) {
      setting.enforceTwoFactor = input.security.enforceTwoFactor;
    }

    if (input.security.restrictInviteDomains !== undefined) {
      setting.restrictInviteDomains = input.security.restrictInviteDomains;
    }
  }

  await Promise.all([setting.save(), merchant.save()]);

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Updated workspace settings",
    category: "workspace",
    status: "ok",
    target: merchant.supportEmail,
    detail: "Workspace settings were updated.",
    metadata: {
      profile: Boolean(input.profile),
      billing: Boolean(input.billing),
      wallets: Boolean(input.wallets),
      notifications: Boolean(input.notifications),
      security: Boolean(input.security),
    },
    ipAddress: null,
    userAgent: null,
  });

  return getSettingsByMerchantId(merchantId, input.environment);
}

export async function saveWalletSettings(
  merchantId: string,
  input: SaveWalletInput
) {
  await assertMerchantKybApprovedForLive(
    merchantId,
    "changing treasury wallets",
    input.environment
  );

  const { setting } = await getOrCreateSetting(merchantId);

  if (input.walletAlerts !== undefined) {
    setting.walletAlerts = input.walletAlerts;
  }
  await setting.save();

  const operations = await createWalletUpdateOperations({
    merchantId,
    actor: input.actor,
    environment: input.environment,
    primaryWallet: input.primaryWallet,
    reserveWallet: input.reserveWallet,
  });

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Updated wallet settings",
    category: "security",
    status: "ok",
    target: input.primaryWallet,
    detail: "Treasury wallet change request created.",
    metadata: {
      primaryWallet: normalizeSolanaAddress(input.primaryWallet),
      reserveWallet: normalizeSolanaAddress(input.reserveWallet),
      operationIds: operations.map((entry) => entry.id),
    },
    ipAddress: null,
    userAgent: null,
  });

  const settings = await getSettingsByMerchantId(merchantId, input.environment);

  return {
    settings,
    operations,
  };
}

export async function promoteReserveWallet(
  merchantId: string,
  input: WalletActionInput
) {
  await assertMerchantKybApprovedForLive(
    merchantId,
    "promoting treasury reserve wallets",
    input.environment
  );

  const operation = await createReservePromoteOperation({
    merchantId,
    actor: input.actor,
    environment: input.environment,
  });

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Requested reserve wallet promotion",
    category: "security",
    status: "warning",
    target: operation.id,
    detail: "Reserve wallet promotion queued for treasury approvals.",
    metadata: {
      operationId: operation.id,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    settings: await getSettingsByMerchantId(merchantId, input.environment),
    operation,
  };
}

export async function removeReserveWallet(
  merchantId: string,
  input: WalletActionInput
) {
  await assertMerchantKybApprovedForLive(
    merchantId,
    "removing treasury reserve wallets",
    input.environment
  );

  const operation = await createReserveClearOperation({
    merchantId,
    actor: input.actor,
    environment: input.environment,
  });

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Requested reserve wallet removal",
    category: "security",
    status: "warning",
    target: operation.id,
    detail: "Reserve wallet removal queued for treasury approvals.",
    metadata: {
      operationId: operation.id,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    settings: await getSettingsByMerchantId(merchantId, input.environment),
    operation,
  };
}

export async function confirmPendingPrimaryWalletChange(
  merchantId: string,
  input: WalletActionInput
) {
  await assertMerchantKybApprovedForLive(
    merchantId,
    "confirming treasury payout wallet changes",
    input.environment
  );

  const operation = await createPayoutWalletConfirmOperation({
    merchantId,
    actor: input.actor,
    environment: input.environment,
  });

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Requested payout wallet confirmation",
    category: "security",
    status: "ok",
    target: operation.id,
    detail: "Pending payout wallet confirmation queued for treasury approvals.",
    metadata: {
      operationId: operation.id,
    },
    ipAddress: null,
    userAgent: null,
  });

  return {
    settings: await getSettingsByMerchantId(merchantId, input.environment),
    operation,
  };
}
