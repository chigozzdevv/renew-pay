import { BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";

import { executeSquadsVaultInstructions } from "@/features/governance/squads.service";
import {
  deriveMerchantIdBytes,
  findConfigPda,
  findLedgerPda,
  findMerchantPda,
  findMerchantVaultPda,
  findPlanPda,
  findSubscriptionPda,
  getRenewProgramRuntime,
  getServerSponsoredTransactionContext,
  hashProgramIdentifier,
  loadSubscriptionContext,
  toFixed6Bn,
  toUnixSeconds,
} from "@/features/solana/renew-program.service";
import { getSolanaAdminKeypair } from "@/features/solana/solana-keypair.service";
import { normalizeSolanaAddress } from "@/shared/constants/solana";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

type Runtime = ReturnType<typeof getRenewProgramRuntime>;

function toProtocolPayload(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function toBillingMode(value: string) {
  return value === "metered" ? { metered: {} } : { fixed: {} };
}

function toCurrencyBytes(value: string) {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    throw new HttpError(400, "Billing currency is required.");
  }

  const bytes = Buffer.alloc(8);
  Buffer.from(normalized, "utf8").copy(bytes, 0, 0, 8);
  return Array.from(bytes);
}

function toPublicKey(value: string, label: string) {
  const normalized = normalizeSolanaAddress(value);

  if (!normalized) {
    throw new HttpError(400, `${label} must be a valid Solana address.`);
  }

  return new PublicKey(normalized);
}

async function resolveSettlementTokenAccount(input: {
  runtime: Runtime;
  destination: string;
  feePayer: PublicKey;
}) {
  const destination = toPublicKey(input.destination, "Destination wallet");
  const candidateInfo = await input.runtime.connection.getAccountInfo(destination);

  if (candidateInfo && candidateInfo.owner.equals(TOKEN_PROGRAM_ID)) {
    const tokenAccount = await getAccount(input.runtime.connection, destination);

    if (!tokenAccount.mint.equals(input.runtime.settlementMint)) {
      throw new HttpError(
        409,
        "Destination token account does not match the settlement mint."
      );
    }

    return {
      tokenAccount: destination,
      preInstructions: [] as TransactionInstruction[],
    };
  }

  const associatedTokenAddress = getAssociatedTokenAddressSync(
    input.runtime.settlementMint,
    destination,
    true
  );
  const associatedTokenInfo = await input.runtime.connection.getAccountInfo(
    associatedTokenAddress
  );

  return {
    tokenAccount: associatedTokenAddress,
    preInstructions: associatedTokenInfo
      ? ([] as TransactionInstruction[])
      : [
          createAssociatedTokenAccountInstruction(
            input.feePayer,
            associatedTokenAddress,
            destination,
            input.runtime.settlementMint
          ),
        ],
  };
}

function toOperatorVaultContext(input: {
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  return {
    operatorMultisig: toPublicKey(input.operatorMultisigAddress, "Operator multisig"),
    operatorVault: toPublicKey(input.operatorVaultAddress, "Operator vault"),
    operatorVaultIndex: input.operatorVaultIndex,
  };
}

async function assertProtocolMerchantAuthority(input: {
  runtime: Runtime;
  merchantIdBytes: Uint8Array;
  operator: ReturnType<typeof toOperatorVaultContext>;
  merchantAddress?: PublicKey;
}) {
  const merchantAddress =
    input.merchantAddress ??
    findMerchantPda(input.runtime.programId, input.merchantIdBytes);
  const accounts = input.runtime.program.account as unknown as Record<
    string,
    {
      fetch(address: PublicKey): Promise<unknown>;
    }
  >;
  const merchant = await accounts.merchant.fetch(merchantAddress);
  const currentAuthority = (merchant as { authority: PublicKey }).authority;

  if (!currentAuthority.equals(input.operator.operatorVault)) {
    throw new HttpError(
      409,
      "Protocol merchant authority is not controlled by the configured operator vault."
    );
  }

  return merchantAddress;
}

function buildPlanTermsArgs(input: {
  usdAmount: number;
  billingIntervalDays: number;
  trialDays: number;
  retryWindowHours: number;
  maxRetryCount: number;
  billingMode: string;
  usageRate?: number | null;
}) {
  return {
    fixedAmount: toFixed6Bn(input.usdAmount),
    usageRate: toFixed6Bn(input.usageRate ?? 0),
    billingIntervalSeconds: new BN(input.billingIntervalDays * 24 * 60 * 60),
    trialPeriodSeconds: new BN(input.trialDays * 24 * 60 * 60),
    retryWindowSeconds: new BN(input.retryWindowHours * 60 * 60),
    maxRetryCount: input.maxRetryCount,
    billingMode: toBillingMode(input.billingMode),
  };
}

function buildSubscriptionArgs(input: {
  customerRef: string;
  billingCurrency: string;
  nextChargeAt: Date | string;
  localAmount: number;
  mandateHash: number[];
}) {
  const firstChargeAt = toUnixSeconds(input.nextChargeAt);

  return {
    customerRefHash: Array.from(hashProgramIdentifier(input.customerRef, "customer")),
    billingCurrency: toCurrencyBytes(input.billingCurrency),
    firstChargeAt: new BN(firstChargeAt),
    localAmountSnapshot: toFixed6Bn(input.localAmount),
    mandateHash: input.mandateHash,
  };
}

export function deriveProtocolMandateHash(input: {
  customerRef: string;
  paymentAccountType?: string | null;
  paymentAccountNumber?: string | null;
  paymentNetworkId?: string | null;
}) {
  return Array.from(
    hashProgramIdentifier(
      JSON.stringify({
        customerRef: input.customerRef.trim(),
        paymentAccountType: input.paymentAccountType?.trim().toLowerCase() ?? "bank",
        paymentAccountNumber: input.paymentAccountNumber?.trim() ?? null,
        paymentNetworkId: input.paymentNetworkId?.trim() ?? null,
      }),
      "mandate"
    )
  );
}

export function deriveProtocolMerchantAddress(input: {
  environment: RuntimeMode;
  merchantId: string;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);

  return findMerchantPda(runtime.programId, merchantIdBytes).toBase58();
}

export function deriveProtocolPlanAddress(input: {
  environment: RuntimeMode;
  merchantId: string;
  planCode: string;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  const planCodeHash = hashProgramIdentifier(input.planCode, "plan_code");

  return findPlanPda(runtime.programId, merchantIdBytes, planCodeHash).toBase58();
}

export function deriveProtocolSubscriptionAddress(input: {
  environment: RuntimeMode;
  merchantId: string;
  subscriptionRef: string;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  const subscriptionRefHash = hashProgramIdentifier(input.subscriptionRef, "subscription");

  return findSubscriptionPda(
    runtime.programId,
    merchantIdBytes,
    subscriptionRefHash
  ).toBase58();
}

export function encodeMerchantRegisterCall(input: {
  payoutWallet: string;
  reserveWallet: string;
  metadataHash: string;
}) {
  return toProtocolPayload({
    instruction: "create_merchant",
    payoutWallet: input.payoutWallet,
    reserveWallet: input.reserveWallet,
    metadataHash: input.metadataHash,
  });
}

export function encodeSetSubscriptionOperatorCall(input: {
  operator: string;
  enabled: boolean;
}) {
  return toProtocolPayload({
    instruction: "subscription_operator_authorize",
    operator: input.operator,
    enabled: input.enabled,
  });
}

export function encodePlanCreateCall(input: {
  planCode: string;
  usdAmount: number;
  billingIntervalDays: number;
  trialDays: number;
  retryWindowHours: number;
  maxRetryCount: number;
  billingMode: string;
  usageRate?: number | null;
}) {
  return toProtocolPayload({
    instruction: "create_plan",
    ...input,
  });
}

export function encodePlanUpdateCall(input: {
  protocolPlanId: string;
  usdAmount: number;
  billingIntervalDays: number;
  trialDays: number;
  retryWindowHours: number;
  maxRetryCount: number;
  billingMode: string;
  usageRate?: number | null;
  active: boolean;
}) {
  return toProtocolPayload({
    instruction: "update_plan",
    ...input,
  });
}

export function getRenewSubscriptionOperatorAddress(environment: RuntimeMode) {
  return getSolanaAdminKeypair(environment).publicKey.toBase58();
}

export async function isMerchantSubscriptionOperatorAuthorized() {
  return true;
}

export async function isProtocolMerchantRegistered(
  environment: RuntimeMode,
  merchantId: string
) {
  const admin = getSolanaAdminKeypair(environment);
  const runtime = getRenewProgramRuntime(environment, admin);
  const merchantIdBytes = deriveMerchantIdBytes(merchantId);
  const merchantAddress = findMerchantPda(runtime.programId, merchantIdBytes);
  const account = await runtime.connection.getAccountInfo(merchantAddress);

  return Boolean(account);
}

export async function createProtocolMerchant(input: {
  environment: RuntimeMode;
  merchantId: string;
  payoutWallet: string;
  metadataHash: string;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const operator = toOperatorVaultContext(input);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  const merchantAddress = findMerchantPda(runtime.programId, merchantIdBytes);
  const existingMerchant = await runtime.connection.getAccountInfo(merchantAddress);

  if (existingMerchant) {
    await assertProtocolMerchantAuthority({
      runtime,
      merchantIdBytes,
      operator,
      merchantAddress,
    });

    return {
      merchantAddress: merchantAddress.toBase58(),
      txHash: null,
    };
  }

  const sponsorshipContext = await getServerSponsoredTransactionContext({
    mode: input.environment,
    serverFeePayer: admin.publicKey,
  });
  const payout = await resolveSettlementTokenAccount({
    runtime,
    destination: input.payoutWallet,
    feePayer: sponsorshipContext.feePayer,
  });
  const instruction = await runtime.program.methods
    .createMerchant(
      Array.from(merchantIdBytes),
      Array.from(
        hashProgramIdentifier(input.metadataHash || input.merchantId, "merchant_metadata")
      )
    )
    .accounts({
      config: findConfigPda(runtime.programId),
      authority: operator.operatorVault,
      payer: admin.publicKey,
      settlementMint: runtime.settlementMint,
      payoutTokenAccount: payout.tokenAccount,
      merchant: merchantAddress,
      ledger: findLedgerPda(runtime.programId, merchantIdBytes),
      merchantVault: findMerchantVaultPda(runtime.programId, merchantIdBytes),
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [...payout.preInstructions, instruction],
  });

  return {
    merchantAddress: merchantAddress.toBase58(),
    txHash: execution.signature,
  };
}

export async function createProtocolPlan(input: {
  environment: RuntimeMode;
  merchantId: string;
  planCode: string;
  usdAmount: number;
  billingIntervalDays: number;
  trialDays: number;
  retryWindowHours: number;
  maxRetryCount: number;
  billingMode: string;
  usageRate?: number | null;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const operator = toOperatorVaultContext(input);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  await assertProtocolMerchantAuthority({
    runtime,
    merchantIdBytes,
    operator,
  });
  const planCodeHash = hashProgramIdentifier(input.planCode, "plan_code");
  const planAddress = findPlanPda(runtime.programId, merchantIdBytes, planCodeHash);
  const instruction = await runtime.program.methods
    .createPlan(Array.from(planCodeHash), buildPlanTermsArgs(input))
    .accounts({
      authority: operator.operatorVault,
      payer: admin.publicKey,
      merchant: findMerchantPda(runtime.programId, merchantIdBytes),
      plan: planAddress,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    protocolPlanId: planAddress.toBase58(),
    txHash: execution.signature,
  };
}

export async function updateProtocolPlan(input: {
  environment: RuntimeMode;
  merchantId: string;
  planCode: string;
  usdAmount: number;
  billingIntervalDays: number;
  trialDays: number;
  retryWindowHours: number;
  maxRetryCount: number;
  billingMode: string;
  usageRate?: number | null;
  active: boolean;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const operator = toOperatorVaultContext(input);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  await assertProtocolMerchantAuthority({
    runtime,
    merchantIdBytes,
    operator,
  });
  const planCodeHash = hashProgramIdentifier(input.planCode, "plan_code");
  const instruction = await runtime.program.methods
    .updatePlan(buildPlanTermsArgs(input), input.active)
    .accounts({
      authority: operator.operatorVault,
      merchant: findMerchantPda(runtime.programId, merchantIdBytes),
      plan: findPlanPda(runtime.programId, merchantIdBytes, planCodeHash),
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function createProtocolSubscriptionForMerchant(input: {
  environment: RuntimeMode;
  merchantId: string;
  protocolPlanId: string;
  subscriptionRef: string;
  customerRef: string;
  billingCurrency: string;
  nextChargeAt: Date | string;
  localAmount: number;
  mandateHash: number[];
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const operator = toOperatorVaultContext(input);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  await assertProtocolMerchantAuthority({
    runtime,
    merchantIdBytes,
    operator,
  });
  const subscriptionRefHash = hashProgramIdentifier(
    input.subscriptionRef,
    "subscription"
  );
  const subscriptionAddress = findSubscriptionPda(
    runtime.programId,
    merchantIdBytes,
    subscriptionRefHash
  );
  const instruction = await runtime.program.methods
    .createSubscription(
      Array.from(subscriptionRefHash),
      buildSubscriptionArgs({
        customerRef: input.customerRef,
        billingCurrency: input.billingCurrency,
        nextChargeAt: input.nextChargeAt,
        localAmount: input.localAmount,
        mandateHash: input.mandateHash,
      })
    )
    .accounts({
      authority: operator.operatorVault,
      payer: admin.publicKey,
      merchant: findMerchantPda(runtime.programId, merchantIdBytes),
      plan: new PublicKey(input.protocolPlanId),
      subscription: subscriptionAddress,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    protocolSubscriptionId: subscriptionAddress.toBase58(),
    txHash: execution.signature,
  };
}

export async function updateProtocolSubscriptionMandate(input: {
  environment: RuntimeMode;
  protocolSubscriptionId: string;
  mandateHash: number[];
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const operator = toOperatorVaultContext(input);
  const context = await loadSubscriptionContext(
    input.environment,
    admin,
    input.protocolSubscriptionId
  );
  await assertProtocolMerchantAuthority({
    runtime: context.runtime,
    merchantIdBytes: context.merchantId,
    operator,
    merchantAddress: context.merchantAddress,
  });
  const instruction = await context.runtime.program.methods
    .updateSubscriptionMandate(input.mandateHash)
    .accounts({
      authority: operator.operatorVault,
      merchant: context.merchantAddress,
      subscription: context.subscriptionAddress,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function pauseProtocolSubscription(input: {
  environment: RuntimeMode;
  protocolSubscriptionId: string;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const operator = toOperatorVaultContext(input);
  const context = await loadSubscriptionContext(
    input.environment,
    admin,
    input.protocolSubscriptionId
  );
  await assertProtocolMerchantAuthority({
    runtime: context.runtime,
    merchantIdBytes: context.merchantId,
    operator,
    merchantAddress: context.merchantAddress,
  });
  const instruction = await context.runtime.program.methods
    .pauseSubscription()
    .accounts({
      authority: operator.operatorVault,
      merchant: context.merchantAddress,
      subscription: context.subscriptionAddress,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function resumeProtocolSubscription(input: {
  environment: RuntimeMode;
  protocolSubscriptionId: string;
  nextChargeAt: Date | string | null | undefined;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const operator = toOperatorVaultContext(input);
  const context = await loadSubscriptionContext(
    input.environment,
    admin,
    input.protocolSubscriptionId
  );
  await assertProtocolMerchantAuthority({
    runtime: context.runtime,
    merchantIdBytes: context.merchantId,
    operator,
    merchantAddress: context.merchantAddress,
  });
  const instruction = await context.runtime.program.methods
    .resumeSubscription(
      input.nextChargeAt ? new BN(toUnixSeconds(input.nextChargeAt)) : null
    )
    .accounts({
      authority: operator.operatorVault,
      merchant: context.merchantAddress,
      subscription: context.subscriptionAddress,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function cancelProtocolSubscription(input: {
  environment: RuntimeMode;
  protocolSubscriptionId: string;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const operator = toOperatorVaultContext(input);
  const context = await loadSubscriptionContext(
    input.environment,
    admin,
    input.protocolSubscriptionId
  );
  await assertProtocolMerchantAuthority({
    runtime: context.runtime,
    merchantIdBytes: context.merchantId,
    operator,
    merchantAddress: context.merchantAddress,
  });
  const instruction = await context.runtime.program.methods
    .cancelSubscription()
    .accounts({
      authority: operator.operatorVault,
      merchant: context.merchantAddress,
      subscription: context.subscriptionAddress,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function requestProtocolPayoutDestinationUpdate(input: {
  environment: RuntimeMode;
  merchantId: string;
  payoutWallet: string;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const operator = toOperatorVaultContext(input);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  const merchantAddress = findMerchantPda(runtime.programId, merchantIdBytes);
  await assertProtocolMerchantAuthority({
    runtime,
    merchantIdBytes,
    operator,
    merchantAddress,
  });
  const sponsorshipContext = await getServerSponsoredTransactionContext({
    mode: input.environment,
    serverFeePayer: admin.publicKey,
  });
  const payout = await resolveSettlementTokenAccount({
    runtime,
    destination: input.payoutWallet,
    feePayer: sponsorshipContext.feePayer,
  });
  const instruction = await runtime.program.methods
    .requestPayoutDestinationUpdate()
    .accounts({
      config: findConfigPda(runtime.programId),
      authority: operator.operatorVault,
      merchant: merchantAddress,
      newPayoutTokenAccount: payout.tokenAccount,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [...payout.preInstructions, instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function confirmProtocolPayoutDestinationUpdate(input: {
  environment: RuntimeMode;
  merchantId: string;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const operator = toOperatorVaultContext(input);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  await assertProtocolMerchantAuthority({
    runtime,
    merchantIdBytes,
    operator,
  });
  const instruction = await runtime.program.methods
    .confirmPayoutDestinationUpdate()
    .accounts({
      authority: operator.operatorVault,
      merchant: findMerchantPda(runtime.programId, merchantIdBytes),
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function withdrawProtocolMerchantBalance(input: {
  environment: RuntimeMode;
  merchantId: string;
  amountUsdc: number;
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const runtime = getRenewProgramRuntime(input.environment, admin);
  const operator = toOperatorVaultContext(input);
  const merchantIdBytes = deriveMerchantIdBytes(input.merchantId);
  const merchantAddress = findMerchantPda(runtime.programId, merchantIdBytes);
  await assertProtocolMerchantAuthority({
    runtime,
    merchantIdBytes,
    operator,
    merchantAddress,
  });
  const merchantVault = findMerchantVaultPda(runtime.programId, merchantIdBytes);
  const instruction = await runtime.program.methods
    .withdraw(toFixed6Bn(input.amountUsdc))
    .accounts({
      config: findConfigPda(runtime.programId),
      authority: operator.operatorVault,
      merchant: merchantAddress,
      ledger: findLedgerPda(runtime.programId, merchantIdBytes),
      merchantVault,
    })
    .instruction();

  const execution = await executeSquadsVaultInstructions({
    environment: input.environment,
    multisigAddress: operator.operatorMultisig.toBase58(),
    vaultIndex: operator.operatorVaultIndex,
    instructions: [instruction],
  });

  return {
    txHash: execution.signature,
  };
}

export async function extractPlanIdFromTransaction(
  environment: RuntimeMode,
  merchantId: string,
  planCode: string
) {
  return deriveProtocolPlanAddress({
    environment,
    merchantId,
    planCode,
  });
}

export async function extractSubscriptionIdFromTransaction(
  environment: RuntimeMode,
  merchantId: string,
  subscriptionRef: string
) {
  return deriveProtocolSubscriptionAddress({
    environment,
    merchantId,
    subscriptionRef,
  });
}
