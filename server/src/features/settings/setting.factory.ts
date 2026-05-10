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
        timezone: merchant.timezone ?? "UTC",
        displayMode: "local-fiat",
        fallbackCurrency: "USDC",
        statementDescriptor: "RENEW",
        brandAccent: "forest-green",
        logoUrl: null,
        customerDomain: "app.renew.sh",
      },
      wallets: {
        primaryWallet: merchant.payoutWallet ?? null,
        walletAlerts: true,
      },
      notifications: {
        paymentAlerts: true,
        settlementAlerts: true,
        developerAlerts: true,
        verificationAlerts: true,
        securityAlerts: true,
      },
      security: {
        sessionTimeout: "30 minutes",
        enforceTwoFactor: false,
      },
    });
  }

  return setting;
}
