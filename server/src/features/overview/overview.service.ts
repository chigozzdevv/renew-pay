import { Types } from "mongoose";

import { CustomerModel } from "@/features/customers/customer.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import {
  listCollectionMarketCatalog,
  quoteUsdAmountInCollectionCurrency,
} from "@/features/onramps/onramp.service";
import { PaymentModel } from "@/features/payments/payment.model";
import { SettlementAccountModel } from "@/features/settlement/settlement-account.model";
import { PayoutModel } from "@/features/payouts/payout.model";
import { SettingModel } from "@/features/settings/setting.model";
import type {
  OverviewMarketCatalogQuery,
  OverviewMarketQuoteQuery,
  OverviewQuery,
} from "@/features/overview/overview.validation";
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

export async function getOverview(query: OverviewQuery) {
  await ensureMerchant(query.merchantId);
  const merchantObjectId = new Types.ObjectId(query.merchantId);
  const environmentMatch = createRuntimeModeCondition("environment", query.environment);
  const scopedMerchantMatch = {
    merchantId: query.merchantId,
    ...environmentMatch,
  };
  const scopedObjectMerchantMatch = {
    merchantId: merchantObjectId,
    ...environmentMatch,
  };

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const settledWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalCustomers,
    openPayments,
    paidPaymentsToday,
    failedPayments,
    pendingPayouts,
    activeSettlementAccounts,
    payoutReadyAggregation,
    settledAggregation,
    marketMixAggregation,
    recentPayments,
    recentPayouts,
  ] = await Promise.all([
    CustomerModel.countDocuments(scopedMerchantMatch).exec(),
    PaymentModel.countDocuments({
      ...scopedMerchantMatch,
      status: { $in: ["open", "pending"] },
    }).exec(),
    PaymentModel.countDocuments({
      ...scopedMerchantMatch,
      status: { $in: ["paid", "settling", "settled"] },
      updatedAt: { $gte: dayStart, $lte: dayEnd },
    }).exec(),
    PaymentModel.countDocuments({
      ...scopedMerchantMatch,
      status: { $in: ["failed", "cancelled"] },
    }).exec(),
    PayoutModel.countDocuments({
      ...scopedMerchantMatch,
      status: { $in: ["queued", "confirming", "pending"] },
    }).exec(),
    SettlementAccountModel.countDocuments({
      ...scopedMerchantMatch,
      status: "active",
    }).exec(),
    PayoutModel.aggregate<{ total: number }>([
      {
        $match: {
          ...scopedObjectMerchantMatch,
          payoutBatchId: null,
          status: { $in: ["queued", "confirming"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$netUsdc" },
        },
      },
    ]).exec(),
    PayoutModel.aggregate<{ total: number }>([
      {
        $match: {
          ...scopedObjectMerchantMatch,
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
    PaymentModel.aggregate<{
      _id: string;
      totalVolume: number;
      count: number;
    }>([
      {
        $match: scopedObjectMerchantMatch,
      },
      {
        $group: {
          _id: "$currency",
          totalVolume: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalVolume: -1 } },
      { $limit: 8 },
    ]).exec(),
    PaymentModel.find(scopedMerchantMatch)
      .sort({ createdAt: -1 })
      .limit(5)
      .select({ payId: 1, description: 1, amount: 1, currency: 1, status: 1, createdAt: 1 })
      .lean()
      .exec(),
    PayoutModel.find(scopedMerchantMatch)
      .sort({ createdAt: -1 })
      .limit(5)
      .select({ batchRef: 1, netUsdc: 1, status: 1, scheduledFor: 1, createdAt: 1 })
      .lean()
      .exec(),
  ]);

  const totalMarketVolume = marketMixAggregation.reduce(
    (sum, item) => sum + item.totalVolume,
    0
  );

  return {
    stats: {
      totalCustomers,
      openPayments,
      paidPaymentsToday,
      failedPayments,
      pendingPayouts,
      activeSettlementAccounts,
      payoutReadyUsdc: payoutReadyAggregation[0]?.total ?? 0,
      settledUsdc30d: settledAggregation[0]?.total ?? 0,
    },
    marketMix: marketMixAggregation.map((item) => ({
      currency: item._id,
      totalVolume: item.totalVolume,
      count: item.count,
      share:
        totalMarketVolume > 0
          ? Number(((item.totalVolume / totalMarketVolume) * 100).toFixed(1))
          : 0,
    })),
    recentActivity: [
      ...recentPayments.map((payment) => ({
        id: String(payment._id),
        type: "payment" as const,
        title: payment.description,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.payId,
        createdAt: payment.createdAt,
      })),
      ...recentPayouts.map((payout) => ({
        id: String(payout._id),
        type: "payout" as const,
        title: payout.batchRef,
        status: payout.status,
        amount: payout.netUsdc,
        currency: "USDC",
        reference: payout.batchRef,
        createdAt: payout.createdAt,
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 8),
  };
}

export async function getOverviewMarketCatalog(query: OverviewMarketCatalogQuery) {
  const merchant = await ensureMerchant(query.merchantId);
  const [settings, marketCatalog] = await Promise.all([
    SettingModel.findOne({ merchantId: query.merchantId })
      .select({ "business.defaultMarket": 1 })
      .lean()
      .exec(),
    listCollectionMarketCatalog(query.environment),
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

export async function getOverviewMarketQuote(query: OverviewMarketQuoteQuery) {
  const merchant = await ensureMerchant(query.merchantId);

  if (!merchant.supportedMarkets.includes(query.currency)) {
    throw new HttpError(
      409,
      `Currency ${query.currency} is not enabled for this merchant.`
    );
  }

  return quoteUsdAmountInCollectionCurrency({
    environment: query.environment,
    currency: query.currency,
    usdAmount: query.amount,
  });
}
