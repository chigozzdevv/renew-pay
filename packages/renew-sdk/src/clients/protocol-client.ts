import { renewProtocolAbi } from "../abi/renew-protocol.js";
import type { ContractTransport } from "./contract-transport.js";
import type { Address } from "../types/protocol.js";

export type RenewProtocolClient = ReturnType<typeof createRenewProtocolClient>;

export function createRenewProtocolClient(
  transport: ContractTransport,
  address: Address
) {
  return {
    address,
    registerMerchant(
      payoutWallet: Address,
      reserveWallet: Address,
      metadataHash: string
    ) {
      return transport.write<void>({
        address,
        abi: renewProtocolAbi,
        functionName: "registerMerchant",
        args: [payoutWallet, reserveWallet, metadataHash],
      });
    },
    setSubscriptionOperator(operator: Address, enabled: boolean) {
      return transport.write<void>({
        address,
        abi: renewProtocolAbi,
        functionName: "setSubscriptionOperator",
        args: [operator, enabled],
      });
    },
    createPlan(input: {
      planCode: string;
      usdPrice: bigint;
      billingInterval: bigint;
      trialPeriod: number;
      retryWindow: number;
      maxRetryCount: number;
      billingMode: number;
      usageRate: bigint;
    }) {
      return transport.write<bigint>({
        address,
        abi: renewProtocolAbi,
        functionName: "createPlan",
        args: [
          input.planCode,
          input.usdPrice,
          input.billingInterval,
          input.trialPeriod,
          input.retryWindow,
          input.maxRetryCount,
          input.billingMode,
          input.usageRate,
        ],
      });
    },
    updatePlan(input: {
      planId: bigint;
      usdPrice: bigint;
      billingInterval: bigint;
      trialPeriod: number;
      retryWindow: number;
      maxRetryCount: number;
      billingMode: number;
      usageRate: bigint;
      active: boolean;
    }) {
      return transport.write<void>({
        address,
        abi: renewProtocolAbi,
        functionName: "updatePlan",
        args: [
          input.planId,
          input.usdPrice,
          input.billingInterval,
          input.trialPeriod,
          input.retryWindow,
          input.maxRetryCount,
          input.billingMode,
          input.usageRate,
          input.active,
        ],
      });
    },
    createSubscription(input: {
      planId: bigint;
      customerRef: string;
      billingCurrency: string;
      firstChargeAt: bigint;
      localAmountSnapshot: bigint;
      mandateHash: string;
    }) {
      return transport.write<bigint>({
        address,
        abi: renewProtocolAbi,
        functionName: "createSubscription",
        args: [
          input.planId,
          input.customerRef,
          input.billingCurrency,
          input.firstChargeAt,
          input.localAmountSnapshot,
          input.mandateHash,
        ],
      });
    },
    createSubscriptionForMerchant(input: {
      merchant: Address;
      planId: bigint;
      customerRef: string;
      billingCurrency: string;
      firstChargeAt: bigint;
      localAmountSnapshot: bigint;
      mandateHash: string;
    }) {
      return transport.write<bigint>({
        address,
        abi: renewProtocolAbi,
        functionName: "createSubscriptionForMerchant",
        args: [
          input.merchant,
          input.planId,
          input.customerRef,
          input.billingCurrency,
          input.firstChargeAt,
          input.localAmountSnapshot,
          input.mandateHash,
        ],
      });
    },
    updateSubscriptionMandateHash(subscriptionId: bigint, mandateHash: string) {
      return transport.write<void>({
        address,
        abi: renewProtocolAbi,
        functionName: "updateSubscriptionMandateHash",
        args: [subscriptionId, mandateHash],
      });
    },
    executeCharge(input: {
      subscriptionId: bigint;
      externalChargeId: string;
      settlementSource: Address;
      localAmount: bigint;
      fxRate: bigint;
      usageUnits: bigint;
      usdcAmount: bigint;
    }) {
      return transport.write<bigint>({
        address,
        abi: renewProtocolAbi,
        functionName: "executeCharge",
        args: [
          input.subscriptionId,
          input.externalChargeId,
          input.settlementSource,
          input.localAmount,
          input.fxRate,
          input.usageUnits,
          input.usdcAmount,
        ],
      });
    },
    recordFailedCharge(input: {
      subscriptionId: bigint;
      externalChargeId: string;
      failureCode: string;
    }) {
      return transport.write<bigint>({
        address,
        abi: renewProtocolAbi,
        functionName: "recordFailedCharge",
        args: [
          input.subscriptionId,
          input.externalChargeId,
          input.failureCode,
        ],
      });
    },
    pauseSubscription(subscriptionId: bigint) {
      return transport.write<void>({
        address,
        abi: renewProtocolAbi,
        functionName: "pauseSubscription",
        args: [subscriptionId],
      });
    },
    resumeSubscription(subscriptionId: bigint, nextChargeAt: bigint) {
      return transport.write<void>({
        address,
        abi: renewProtocolAbi,
        functionName: "resumeSubscription",
        args: [subscriptionId, nextChargeAt],
      });
    },
    cancelSubscription(subscriptionId: bigint) {
      return transport.write<void>({
        address,
        abi: renewProtocolAbi,
        functionName: "cancelSubscription",
        args: [subscriptionId],
      });
    },
  };
}
