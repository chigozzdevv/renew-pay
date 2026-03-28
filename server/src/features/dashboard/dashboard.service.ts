import { Types } from "mongoose";

import { CustomerModel } from "@/features/customers/customer.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  listBillingMarketCatalog,
  quoteUsdAmountInBillingCurrency,
} from "@/features/payment-rails/payment-rails.service";
import { PlanModel } from "@/features/plans/plan.model";
import { SettingModel } from "@/features/settings/setting.model";
import { SettlementModel } from "@/features/settlements/settlement.model";
import { SubscriptionModel } from "@/features/subscriptions/subscription.model";
import type {
  DashboardMarketCatalogQuery,
  DashboardMarketQuoteQuery,
  DashboardOverviewQuery,
} from "@/features/dashboard/dashboard.validation";
import { HttpError } from "@/shared/errors/http-error";
import { createRuntimeModeCondition } from "@/shared/utils/runtime-environment";

async function ensureMerchant(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

export async function getDashboardOverview(query: DashboardOverviewQuery) {
  await ensureMerchant(query.merchantId);
  const merchantObjectId = new Types.ObjectId(query.merchantId);
  const environmentMatch = createRuntimeModeCondition("environment", query.environment);
  const scopedMerchantMatch = {
    merchantId: query.merchantId,
    ...environmentMatch,
  };

  const now = new Date();
  const nextTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const settledWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalCustomers,
    atRiskCustomers,
    activePlans,
    activeSubscriptions,
    meteredPlans,
    pendingSettlements,
    readyNetAggregation,
    settledAggregation,
    marketMixAggregation,
    upcomingSubscriptions,
  ] = await Promise.all([
    CustomerModel.countDocuments(scopedMerchantMatch).exec(),
    CustomerModel.countDocuments({
      $and: [
        scopedMerchantMatch,
        {
          $or: [
            { status: "at_risk" },
            { billingState: "at_risk" },
            { paymentMethodState: "update_needed" },
          ],
        },
      ],
    }).exec(),
    PlanModel.countDocuments({
      ...scopedMerchantMatch,
      status: "active",
    }).exec(),
    SubscriptionModel.countDocuments({
      ...scopedMerchantMatch,
      status: { $in: ["active", "trialing"] },
    }).exec(),
    PlanModel.countDocuments({
      ...scopedMerchantMatch,
      billingMode: "metered",
      status: { $ne: "archived" },
    }).exec(),
    SettlementModel.countDocuments({
      ...scopedMerchantMatch,
      status: { $in: ["queued", "confirming", "pending"] },
    }).exec(),
    SettlementModel.aggregate<{ total: number }>([
      {
        $match: {
          merchantId: merchantObjectId,
          ...environmentMatch,
          status: { $in: ["queued", "confirming", "pending"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$netUsdc" },
        },
      },
    ]).exec(),
    SettlementModel.aggregate<{ total: number }>([
      {
        $match: {
          merchantId: merchantObjectId,
          ...environmentMatch,
          status: "settled",
          settledAt: { $gte: settledWindowStart },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$netUsdc" },
        },
      },
    ]).exec(),
    CustomerModel.aggregate<{
      _id: string;
      totalVolume: number;
    }>([
      {
        $match: {
          merchantId: merchantObjectId,
          ...environmentMatch,
          monthlyVolumeUsdc: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$market",
          totalVolume: { $sum: "$monthlyVolumeUsdc" },
        },
      },
      { $sort: { totalVolume: -1 } },
      { $limit: 8 },
    ]).exec(),
    SubscriptionModel.find({
      ...scopedMerchantMatch,
      status: { $in: ["active", "trialing"] },
      nextChargeAt: { $gte: startOfDay(now), $lte: endOfDay(nextTwoDays) },
    })
      .sort({ nextChargeAt: 1 })
      .limit(5)
      .select({
        customerName: 1,
        planId: 1,
        billingCurrency: 1,
        localAmount: 1,
        nextChargeAt: 1,
      })
      .lean()
      .exec(),
  ]);

  const planIds = [...new Set(upcomingSubscriptions.map((subscription) => String(subscription.planId)))];
  const plans = planIds.length
    ? await PlanModel.find({
      _id: { $in: planIds },
      ...environmentMatch,
    })
      .select({ _id: 1, name: 1 })
      .lean()
      .exec()
    : [];
  const planNameById = new Map(plans.map((plan) => [String(plan._id), plan.name]));

  const totalMarketVolume = marketMixAggregation.reduce(
    (sum, item) => sum + item.totalVolume,
    0
  );

  const marketMix = marketMixAggregation.map((item) => ({
    market: item._id,
    totalVolume: item.totalVolume,
    share:
      totalMarketVolume > 0
        ? Number(((item.totalVolume / totalMarketVolume) * 100).toFixed(1))
        : 0,
  }));

  const upcomingRenewals = upcomingSubscriptions.map((subscription) => ({
    subscriptionId: String(subscription._id),
    customerName: subscription.customerName,
    planName: planNameById.get(String(subscription.planId)) ?? "Plan",
    billingCurrency: subscription.billingCurrency,
    localAmount: subscription.localAmount,
    nextChargeAt: subscription.nextChargeAt,
  }));

  return {
    stats: {
      totalCustomers,
      atRiskCustomers,
      activePlans,
      meteredPlans,
      activeSubscriptions,
      pendingSettlements,
      readyNetUsdc: readyNetAggregation[0]?.total ?? 0,
      settledUsdc30d: settledAggregation[0]?.total ?? 0,
    },
    marketMix,
    upcomingRenewals,
  };
}

export async function getDashboardMarketCatalog(query: DashboardMarketCatalogQuery) {
  const merchant = await ensureMerchant(query.merchantId);
  const [settings, marketCatalog] = await Promise.all([
    SettingModel.findOne({ merchantId: query.merchantId })
      .select({ "business.defaultMarket": 1 })
      .lean()
      .exec(),
    listBillingMarketCatalog(query.environment),
  ]);

  const marketMap = new Map(marketCatalog.map((entry) => [entry.currency, entry]));
  const merchantSupportedMarkets = merchant.supportedMarkets.filter((market) =>
    marketMap.has(market)
  );
  const defaultMarketCandidate =
    settings?.business?.defaultMarket ?? merchant.supportedMarkets[0] ?? null;
  const defaultMarket =
    defaultMarketCandidate && marketMap.has(defaultMarketCandidate)
      ? defaultMarketCandidate
      : merchantSupportedMarkets[0] ?? marketCatalog[0]?.currency ?? null;

  return {
    merchantSupportedMarkets,
    defaultMarket,
    markets: marketCatalog,
  };
}

export async function getDashboardPlanMarketQuote(query: DashboardMarketQuoteQuery) {
  const merchant = await ensureMerchant(query.merchantId);
  const plan = await PlanModel.findOne({
    _id: query.planId,
    merchantId: query.merchantId,
    ...createRuntimeModeCondition("environment", query.environment),
  }).exec();

  if (!plan) {
    throw new HttpError(404, "Plan was not found.");
  }

  if (!merchant.supportedMarkets.includes(query.currency)) {
    throw new HttpError(
      409,
      `Currency ${query.currency} is not enabled for this merchant.`
    );
  }

  if (!plan.supportedMarkets.includes(query.currency)) {
    throw new HttpError(
      409,
      `Currency ${query.currency} is not enabled for this plan.`
    );
  }

  return quoteUsdAmountInBillingCurrency({
    environment: query.environment,
    currency: query.currency,
    usdAmount: plan.usdAmount,
  });
}
