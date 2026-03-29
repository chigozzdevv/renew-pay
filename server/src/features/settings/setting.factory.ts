import { MerchantModel } from "@/features/merchants/merchant.model";
import { SettingModel } from "@/features/settings/setting.model";
import { HttpError } from "@/shared/errors/http-error";

/**
 * Finds or creates the setting document for a merchant with all default fields.
 * Intentionally imports only models (no services) to avoid circular dependencies.
 */
export async function getOrCreateMerchantSetting(merchantId: string) {
  let setting = await SettingModel.findOne({ merchantId }).exec();

  if (!setting) {
    const merchant = await MerchantModel.findById(merchantId).exec();

    if (!merchant) {
      throw new HttpError(404, "Merchant was not found.");
    }

    setting = await SettingModel.create({
      merchantId: merchant._id,
      business: {
        name: merchant.name ?? "",
        supportEmail: merchant.supportEmail ?? "",
        defaultMarket: merchant.supportedMarkets[0] ?? "NGN",
        invoicePrefix: "RNL",
        billingTimezone: merchant.billingTimezone,
        billingDisplay: "local-fiat",
        fallbackCurrency: "USDC",
        statementDescriptor: "RENEW",
        brandAccent: "forest-green",
        logoUrl: null,
        customerDomain: "app.renew.sh",
        invoiceFooter: "Thanks for billing with Renew.",
      },
      billing: {
        retryPolicy: "Smart retries",
        invoiceGraceDays: 2,
        autoRetries: true,
        meterApproval: true,
      },
      wallets: {
        primaryWallet: merchant.payoutWallet,
        reserveWallet: merchant.reserveWallet ?? null,
        walletAlerts: true,
      },
      notifications: {
        financeDigest: true,
        developerAlerts: true,
        loginAlerts: true,
        customerSubscriptionEmails: true,
        customerReceiptEmails: true,
        customerPaymentFollowUps: true,
        merchantSubscriptionAlerts: true,
        merchantPaymentDigestFrequency: "daily",
        merchantPaymentDigestMode: "counts",
        teamInviteEmails: true,
        governanceAlerts: true,
        treasuryAlerts: true,
        verificationAlerts: true,
        securityAlerts: true,
      },
      security: {
        sessionTimeout: "30 minutes",
        inviteDomainPolicy: "Allow all domains",
        enforceTwoFactor: false,
        restrictInviteDomains: false,
      },
      treasury: {
        sweepApprovalThreshold: 1,
        payoutMode: "manual",
        autoPayoutFrequency: null,
        autoPayoutTimeLocal: "09:00",
        thresholdPayoutEnabled: false,
        autoPayoutThresholdUsdc: null,
      },
    });
  }

  return setting;
}
