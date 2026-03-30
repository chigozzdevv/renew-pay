import { BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";

import {
  createFxQuoteArgs,
  findChargeReceiptPda,
  findConfigPda,
  findCycleMarkerPda,
  findLedgerPda,
  hashProgramIdentifier,
  loadMerchantContext,
  loadSubscriptionContext,
  getRenewProgramRuntime,
  sendSponsoredTransaction,
  toFixed6Bn,
  toUnixSeconds,
} from "@/features/solana/renew-program.service";
import {
  getSolanaAdminKeypair,
  getSolanaSettlementAuthorityKeypair,
} from "@/features/solana/solana-keypair.service";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

type ProtocolChargeExecutionInput =
  | {
      mode: "subscription_charge_success";
      providerRef?: string | null;
      externalChargeId: string;
      protocolSubscriptionId: string;
      billingPeriodStart: Date | string | number;
      localAmount: number;
      fxRate: number;
      usageUnits?: number;
      usdcAmount: number;
    }
  | {
      mode: "invoice_settlement";
      providerRef?: string | null;
      merchantAddress: string;
      externalChargeId: string;
      commercialRef: string;
      localAmount: number;
      fxRate: number;
      amountUsdc: number;
    };

async function buildSettlementSourceAtaInstruction(input: {
  settlementAuthority: ReturnType<typeof getSolanaSettlementAuthorityKeypair>;
  settlementMint: PublicKey;
  settlementSourceTokenAccount: PublicKey;
  connection: Connection;
}) {
  const existingAccount = await input.connection.getAccountInfo(
    input.settlementSourceTokenAccount
  );

  if (existingAccount) {
    return [];
  }

  return [
    createAssociatedTokenAccountInstruction(
      input.settlementAuthority.publicKey,
      input.settlementSourceTokenAccount,
      input.settlementAuthority.publicKey,
      input.settlementMint
    ),
  ];
}

async function ensureSettlementSourceBalance(input: {
  environment: RuntimeMode;
  settlementAuthority: ReturnType<typeof getSolanaSettlementAuthorityKeypair>;
  settlementMint: PublicKey;
  settlementSourceTokenAccount: PublicKey;
  connection: Connection;
  amountUsdc: number;
}) {
  const requiredAmount = BigInt(Math.round(input.amountUsdc * 1_000_000));

  if (requiredAmount <= 0n) {
    return;
  }

  const admin = getSolanaAdminKeypair(input.environment);
  const adminRuntime = getRenewProgramRuntime(input.environment, admin);
  const adminTokenAccount = getAssociatedTokenAddressSync(
    input.settlementMint,
    admin.publicKey
  );
  const settlementAccountInfo = await input.connection.getAccountInfo(
    input.settlementSourceTokenAccount
  );

  const currentSettlementBalance = settlementAccountInfo
    ? (await getAccount(input.connection, input.settlementSourceTokenAccount)).amount
    : 0n;

  if (currentSettlementBalance >= requiredAmount) {
    return;
  }

  const adminAccountInfo = await adminRuntime.connection.getAccountInfo(adminTokenAccount);

  if (!adminAccountInfo) {
    throw new HttpError(
      409,
      `Sandbox settlement funding is missing. Fund admin wallet ${admin.publicKey.toBase58()} with test USDC.`
    );
  }

  const adminBalance = (await getAccount(adminRuntime.connection, adminTokenAccount)).amount;
  const topUpAmount = requiredAmount - currentSettlementBalance;

  if (adminBalance < topUpAmount) {
    throw new HttpError(
      409,
      `Sandbox settlement funding is insufficient. Fund admin wallet ${admin.publicKey.toBase58()} with at least ${Number(topUpAmount) / 1_000_000} test USDC.`
    );
  }

  const topUpInstructions = [
    ...(settlementAccountInfo
      ? []
      : [
          createAssociatedTokenAccountInstruction(
            admin.publicKey,
            input.settlementSourceTokenAccount,
            input.settlementAuthority.publicKey,
            input.settlementMint
          ),
        ]),
    createTransferInstruction(
      adminTokenAccount,
      input.settlementSourceTokenAccount,
      admin.publicKey,
      topUpAmount
    ),
  ];

  await sendSponsoredTransaction({
    mode: input.environment,
    authority: admin,
    instructions: topUpInstructions,
  });
}

export async function executeProtocolSettlement(
  input: ProtocolChargeExecutionInput & {
    environment: RuntimeMode;
  }
) {
  const settlementAuthority = getSolanaSettlementAuthorityKeypair(input.environment);

  if (input.mode === "subscription_charge_success") {
    const context = await loadSubscriptionContext(
      input.environment,
      settlementAuthority,
      input.protocolSubscriptionId
    );
    const externalChargeRefHash = hashProgramIdentifier(
      input.externalChargeId,
      "charge"
    );
    const billingPeriodStart = toUnixSeconds(input.billingPeriodStart);
    const chargeReceiptAddress = findChargeReceiptPda(
      context.runtime.programId,
      context.merchantId,
      externalChargeRefHash
    );
    const cycleMarkerAddress = findCycleMarkerPda(
      context.runtime.programId,
      context.subscriptionRefHash,
      billingPeriodStart
    );
    await ensureSettlementSourceBalance({
      environment: input.environment,
      settlementAuthority,
      settlementMint: context.runtime.settlementMint,
      settlementSourceTokenAccount: context.settlementSourceTokenAccount,
      connection: context.runtime.connection,
      amountUsdc: input.usdcAmount,
    });
    const preInstructions = await buildSettlementSourceAtaInstruction({
      settlementAuthority,
      settlementMint: context.runtime.settlementMint,
      settlementSourceTokenAccount: context.settlementSourceTokenAccount,
      connection: context.runtime.connection,
    });
    const instruction = await context.runtime.program.methods
      .recordSubscriptionChargeSuccess(
        Array.from(externalChargeRefHash),
        new BN(billingPeriodStart),
        toFixed6Bn(input.localAmount),
        createFxQuoteArgs({
          externalRef: input.externalChargeId,
          providerRef: input.providerRef ?? "yellow_card",
          fxRate: input.fxRate,
        }),
        toFixed6Bn(input.usageUnits ?? 0),
        toFixed6Bn(input.usdcAmount)
      )
      .accounts({
        config: findConfigPda(context.runtime.programId),
        settlementAuthority: settlementAuthority.publicKey,
        merchant: context.merchantAddress,
        ledger: findLedgerPda(context.runtime.programId, context.merchantId),
        subscription: context.subscriptionAddress,
        chargeReceipt: chargeReceiptAddress,
        cycleMarker: cycleMarkerAddress,
        merchantVault: context.merchantVault,
        feeVault: context.feeVault,
        settlementSourceTokenAccount: context.settlementSourceTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const execution = await sendSponsoredTransaction({
      mode: input.environment,
      authority: settlementAuthority,
      instructions: [...preInstructions, instruction],
    });

    return {
      bridgeSourceTxHash: null,
      bridgeReceiveTxHash: null,
      creditTxHash: execution.signature,
      attestedAt: new Date(),
      protocolExecutionKind: "subscription_charge_success" as const,
      protocolChargeId: chargeReceiptAddress.toBase58(),
    };
  }

  const context = await loadMerchantContext(
    input.environment,
    settlementAuthority,
    input.merchantAddress
  );
  const externalChargeRefHash = hashProgramIdentifier(input.externalChargeId, "charge");
  const chargeReceiptAddress = findChargeReceiptPda(
    context.runtime.programId,
    context.merchantId,
    externalChargeRefHash
  );
  await ensureSettlementSourceBalance({
    environment: input.environment,
    settlementAuthority,
    settlementMint: context.runtime.settlementMint,
    settlementSourceTokenAccount: context.settlementSourceTokenAccount,
    connection: context.runtime.connection,
    amountUsdc: input.amountUsdc,
  });
  const preInstructions = await buildSettlementSourceAtaInstruction({
    settlementAuthority,
    settlementMint: context.runtime.settlementMint,
    settlementSourceTokenAccount: context.settlementSourceTokenAccount,
    connection: context.runtime.connection,
  });
  const instruction = await context.runtime.program.methods
    .recordInvoiceSettlement(
      Array.from(externalChargeRefHash),
      Array.from(hashProgramIdentifier(input.commercialRef, "invoice")),
      toFixed6Bn(input.localAmount),
      createFxQuoteArgs({
        externalRef: input.externalChargeId,
        providerRef: input.providerRef ?? "yellow_card",
        fxRate: input.fxRate,
      }),
      toFixed6Bn(input.amountUsdc)
    )
    .accounts({
      config: findConfigPda(context.runtime.programId),
      settlementAuthority: settlementAuthority.publicKey,
      merchant: context.merchantAddress,
      ledger: context.ledgerAddress,
      chargeReceipt: chargeReceiptAddress,
      merchantVault: context.merchantVault,
      feeVault: context.feeVault,
      settlementSourceTokenAccount: context.settlementSourceTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const execution = await sendSponsoredTransaction({
    mode: input.environment,
    authority: settlementAuthority,
    instructions: [...preInstructions, instruction],
  });

  return {
    bridgeSourceTxHash: null,
    bridgeReceiveTxHash: null,
    creditTxHash: execution.signature,
    attestedAt: new Date(),
    protocolExecutionKind: "invoice_settlement" as const,
    protocolChargeId: chargeReceiptAddress.toBase58(),
  };
}

export async function recordProtocolChargeFailure(input: {
  environment: RuntimeMode;
  protocolSubscriptionId: string;
  externalChargeId: string;
  failureCode: string;
}) {
  const settlementAuthority = getSolanaSettlementAuthorityKeypair(input.environment);
  const context = await loadSubscriptionContext(
    input.environment,
    settlementAuthority,
    input.protocolSubscriptionId
  );
  const externalChargeRefHash = hashProgramIdentifier(input.externalChargeId, "charge");
  const chargeReceiptAddress = findChargeReceiptPda(
    context.runtime.programId,
    context.merchantId,
    externalChargeRefHash
  );
  const instruction = await context.runtime.program.methods
    .recordSubscriptionChargeFailure(
      Array.from(externalChargeRefHash),
      new BN(Math.floor(Date.now() / 1000)),
      Array.from(hashProgramIdentifier(input.failureCode, "failure"))
    )
    .accounts({
      config: findConfigPda(context.runtime.programId),
      settlementAuthority: settlementAuthority.publicKey,
      merchant: context.merchantAddress,
      subscription: context.subscriptionAddress,
      chargeReceipt: chargeReceiptAddress,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const execution = await sendSponsoredTransaction({
    mode: input.environment,
    authority: settlementAuthority,
    instructions: [instruction],
  });

  return {
    protocolChargeId: chargeReceiptAddress.toBase58(),
    txHash: execution.signature,
  };
}
