import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { normalizeSolanaAddress } from "@/shared/constants/solana";

import { appendAuditLog } from "@/features/audit/audit.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { getOrCreateMerchantSetting } from "@/features/settings/setting.factory";
import type { SettingDocument } from "@/features/settings/setting.model";
import type {
  SaveWalletInput,
  UpdateSettingsInput,
} from "@/features/settings/setting.validation";

function toSettingResponse(document: SettingDocument) {
  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    business: {
      name: document.business.name,
      supportEmail: document.business.supportEmail,
      defaultMarket: document.business.defaultMarket,
      invoicePrefix: document.business.invoicePrefix,
      billingTimezone: document.business.billingTimezone,
      billingDisplay: document.business.billingDisplay,
      fallbackCurrency: document.business.fallbackCurrency,
      statementDescriptor: document.business.statementDescriptor,
      brandAccent: document.business.brandAccent,
      logoUrl: document.business.logoUrl ?? null,
      customerDomain: document.business.customerDomain,
      invoiceFooter: document.business.invoiceFooter,
    },
    billing: {
      retryPolicy: document.billing.retryPolicy,
      invoiceGraceDays: document.billing.invoiceGraceDays,
      autoRetries: document.billing.autoRetries,
      meterApproval: document.billing.meterApproval,
    },
    wallets: {
      primaryWallet: document.wallets.primaryWallet ?? "",
      walletAlerts: document.wallets.walletAlerts,
    },
    notifications: {
      customerSubscriptionEmails: document.notifications.customerSubscriptionEmails,
      customerReceiptEmails: document.notifications.customerReceiptEmails,
      customerPaymentFollowUps: document.notifications.customerPaymentFollowUps,
      merchantSubscriptionAlerts: document.notifications.merchantSubscriptionAlerts,
      merchantPaymentDigestFrequency:
        document.notifications.merchantPaymentDigestFrequency ??
        (document.notifications.financeDigest === false ? "off" : "daily"),
      merchantPaymentDigestMode:
        document.notifications.merchantPaymentDigestMode ?? "counts",
      teamInviteEmails: document.notifications.teamInviteEmails,
      verificationAlerts: document.notifications.verificationAlerts,
      developerAlerts: document.notifications.developerAlerts,
      securityAlerts:
        document.notifications.securityAlerts ??
        document.notifications.loginAlerts ??
        true,
    },
    security: {
      sessionTimeout: document.security.sessionTimeout,
      inviteDomainPolicy: document.security.inviteDomainPolicy,
      enforceTwoFactor: document.security.enforceTwoFactor,
      restrictInviteDomains: document.security.restrictInviteDomains,
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
  _environment: RuntimeMode = "test"
) {
  const { setting } = await getOrCreateSetting(merchantId);

  return toSettingResponse(setting);
}

export async function updateSettingsByMerchantId(
  merchantId: string,
  input: UpdateSettingsInput
) {
  const { merchant, setting } = await getOrCreateSetting(merchantId);

  const mutatesWallets =
    input.wallets !== undefined &&
    input.wallets.primaryWallet !== undefined;

  if (mutatesWallets) {
    await assertMerchantKybApprovedForLive(
      merchantId,
      "changing payout wallets",
      input.environment
    );
  }

  if (input.business) {
    if (input.business.name !== undefined) {
      setting.business.name = input.business.name;
      merchant.name = input.business.name;
    }

    if (input.business.supportEmail !== undefined) {
      setting.business.supportEmail = input.business.supportEmail;
      merchant.supportEmail = input.business.supportEmail;
    }

    if (input.business.defaultMarket !== undefined) {
      if (!merchant.supportedMarkets.includes(input.business.defaultMarket)) {
        throw new HttpError(
          409,
          `Default market ${input.business.defaultMarket} is not enabled for this merchant.`
        );
      }
      setting.business.defaultMarket = input.business.defaultMarket;
    }

    if (input.business.invoicePrefix !== undefined) {
      setting.business.invoicePrefix = input.business.invoicePrefix;
    }

    if (input.business.billingTimezone !== undefined) {
      setting.business.billingTimezone = input.business.billingTimezone;
      merchant.billingTimezone = input.business.billingTimezone;
    }

    if (input.business.billingDisplay !== undefined) {
      setting.business.billingDisplay = input.business.billingDisplay;
    }

    if (input.business.fallbackCurrency !== undefined) {
      setting.business.fallbackCurrency = input.business.fallbackCurrency;
    }

    if (input.business.statementDescriptor !== undefined) {
      setting.business.statementDescriptor = input.business.statementDescriptor;
    }

    if (input.business.brandAccent !== undefined) {
      setting.business.brandAccent = input.business.brandAccent;
    }

    if (input.business.logoUrl !== undefined) {
      setting.business.logoUrl = input.business.logoUrl;
    }

    if (input.business.customerDomain !== undefined) {
      setting.business.customerDomain = input.business.customerDomain;
    }

    if (input.business.invoiceFooter !== undefined) {
      setting.business.invoiceFooter = input.business.invoiceFooter;
    }
  }

  if (input.billing) {
    if (input.billing.retryPolicy !== undefined) {
      setting.billing.retryPolicy = input.billing.retryPolicy;
    }

    if (input.billing.invoiceGraceDays !== undefined) {
      setting.billing.invoiceGraceDays = input.billing.invoiceGraceDays;
    }

    if (input.billing.autoRetries !== undefined) {
      setting.billing.autoRetries = input.billing.autoRetries;
    }

    if (input.billing.meterApproval !== undefined) {
      setting.billing.meterApproval = input.billing.meterApproval;
    }
  }

  if (input.wallets) {
    if (input.wallets.primaryWallet !== undefined) {
      const primaryWallet = normalizeSolanaAddress(input.wallets.primaryWallet);
      setting.wallets.primaryWallet = primaryWallet;
      merchant.payoutWallet = primaryWallet;
    }

    if (input.wallets.walletAlerts !== undefined) {
      setting.wallets.walletAlerts = input.wallets.walletAlerts;
    }
  }

  if (input.notifications) {
    if (input.notifications.customerSubscriptionEmails !== undefined) {
      setting.notifications.customerSubscriptionEmails =
        input.notifications.customerSubscriptionEmails;
    }

    if (input.notifications.customerReceiptEmails !== undefined) {
      setting.notifications.customerReceiptEmails =
        input.notifications.customerReceiptEmails;
    }

    if (input.notifications.customerPaymentFollowUps !== undefined) {
      setting.notifications.customerPaymentFollowUps =
        input.notifications.customerPaymentFollowUps;
    }

    if (input.notifications.merchantSubscriptionAlerts !== undefined) {
      setting.notifications.merchantSubscriptionAlerts =
        input.notifications.merchantSubscriptionAlerts;
    }

    if (input.notifications.merchantPaymentDigestFrequency !== undefined) {
      setting.notifications.merchantPaymentDigestFrequency =
        input.notifications.merchantPaymentDigestFrequency;
      setting.notifications.financeDigest =
        input.notifications.merchantPaymentDigestFrequency !== "off";
    }

    if (input.notifications.merchantPaymentDigestMode !== undefined) {
      setting.notifications.merchantPaymentDigestMode =
        input.notifications.merchantPaymentDigestMode;
    }

    if (input.notifications.teamInviteEmails !== undefined) {
      setting.notifications.teamInviteEmails = input.notifications.teamInviteEmails;
    }

    if (input.notifications.verificationAlerts !== undefined) {
      setting.notifications.verificationAlerts =
        input.notifications.verificationAlerts;
    }

    if (input.notifications.developerAlerts !== undefined) {
      setting.notifications.developerAlerts = input.notifications.developerAlerts;
    }

    if (input.notifications.securityAlerts !== undefined) {
      setting.notifications.securityAlerts = input.notifications.securityAlerts;
      setting.notifications.loginAlerts = input.notifications.securityAlerts;
    }
  }

  if (input.security) {
    if (input.security.sessionTimeout !== undefined) {
      setting.security.sessionTimeout = input.security.sessionTimeout;
    }

    if (input.security.inviteDomainPolicy !== undefined) {
      setting.security.inviteDomainPolicy = input.security.inviteDomainPolicy;
    }

    if (input.security.enforceTwoFactor !== undefined) {
      setting.security.enforceTwoFactor = input.security.enforceTwoFactor;
    }

    if (input.security.restrictInviteDomains !== undefined) {
      setting.security.restrictInviteDomains = input.security.restrictInviteDomains;
    }
  }

  await Promise.all([setting.save(), merchant.save()]);

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Updated workspace settings",
    category: "workspace",
    status: "ok",
    target: merchant.supportEmail ?? null,
    detail: "Workspace settings were updated.",
    metadata: {
      business: Boolean(input.business),
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
    "changing payout wallets",
    input.environment
  );

  const { merchant, setting } = await getOrCreateSetting(merchantId);
  const primaryWallet = normalizeSolanaAddress(input.primaryWallet);

  setting.wallets.primaryWallet = primaryWallet;
  merchant.payoutWallet = primaryWallet;

  if (input.walletAlerts !== undefined) {
    setting.wallets.walletAlerts = input.walletAlerts;
  }
  await Promise.all([setting.save(), merchant.save()]);

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Updated wallet settings",
    category: "security",
    status: "ok",
    target: primaryWallet,
    detail: "Payout wallet settings were updated.",
    metadata: {
      primaryWallet,
    },
    ipAddress: null,
    userAgent: null,
  });

  const settings = await getSettingsByMerchantId(merchantId, input.environment);

  return {
    settings,
  };
}
