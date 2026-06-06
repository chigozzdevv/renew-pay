import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { normalizeStellarAddress } from "@/shared/constants/stellar";

import { appendAuditLog } from "@/features/audit/audit.service";
import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  assertStellarUsdcTrustline,
} from "@/features/settlement/providers/stellar/trustline.service";
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
      timezone: document.business.timezone ?? "UTC",
      displayMode: document.business.displayMode ?? "local-fiat",
      fallbackCurrency: document.business.fallbackCurrency,
      statementDescriptor: document.business.statementDescriptor,
      brandAccent: document.business.brandAccent,
      logoUrl: document.business.logoUrl ?? null,
      customerDomain: document.business.customerDomain,
    },
    wallets: {
      primaryWallet: document.wallets.primaryWallet ?? "",
      walletAlerts: document.wallets.walletAlerts,
    },
    checkout: {
      mode: document.checkout?.mode ?? "modal",
      returnPage: document.checkout?.returnPage ?? null,
      allowedDomains: document.checkout?.allowedDomains ?? [],
    },
    notifications: {
      paymentAlerts: document.notifications.paymentAlerts ?? true,
      settlementAlerts: document.notifications.settlementAlerts ?? true,
    },
    security: {
      sessionTimeout: document.security.sessionTimeout,
      enforceTwoFactor: document.security.enforceTwoFactor,
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

    if (input.business.timezone !== undefined) {
      setting.business.timezone = input.business.timezone;
      merchant.timezone = input.business.timezone;
    }

    if (input.business.displayMode !== undefined) {
      setting.business.displayMode = input.business.displayMode;
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
  }

  if (input.wallets) {
    if (input.wallets.primaryWallet !== undefined) {
      const primaryWallet = normalizeStellarAddress(input.wallets.primaryWallet);
      await assertStellarUsdcTrustline({
        environment: input.environment,
        address: primaryWallet ?? "",
        ownerLabel: "Settlement wallet",
      });
      setting.wallets.primaryWallet = primaryWallet;
      merchant.payoutWallet = primaryWallet;
    }

    if (input.wallets.walletAlerts !== undefined) {
      setting.wallets.walletAlerts = input.wallets.walletAlerts;
    }
  }

  if (input.checkout) {
    if (input.checkout.mode !== undefined) {
      setting.checkout.mode = input.checkout.mode;
    }

    if (input.checkout.returnPage !== undefined) {
      setting.checkout.returnPage = input.checkout.returnPage;
    }

    if (input.checkout.allowedDomains !== undefined) {
      setting.checkout.allowedDomains = input.checkout.allowedDomains;
    }
  }

  if (input.notifications) {
    if (input.notifications.paymentAlerts !== undefined) {
      setting.notifications.paymentAlerts = input.notifications.paymentAlerts;
    }

    if (input.notifications.settlementAlerts !== undefined) {
      setting.notifications.settlementAlerts = input.notifications.settlementAlerts;
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
    }
  }

  if (input.security) {
    if (input.security.sessionTimeout !== undefined) {
      setting.security.sessionTimeout = input.security.sessionTimeout;
    }

    if (input.security.enforceTwoFactor !== undefined) {
      setting.security.enforceTwoFactor = input.security.enforceTwoFactor;
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
      wallets: Boolean(input.wallets),
      checkout: Boolean(input.checkout),
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
  const primaryWallet = normalizeStellarAddress(input.primaryWallet);
  await assertStellarUsdcTrustline({
    environment: input.environment,
    address: primaryWallet ?? "",
    ownerLabel: "Settlement wallet",
  });

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
