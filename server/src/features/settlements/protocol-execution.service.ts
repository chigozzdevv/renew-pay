import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import {
  createFxQuoteArgs,
  findConfigPda,
  findChargeReceiptPda,
  findCycleMarkerPda,
  findLedgerPda,
  hashProgramIdentifier,
  loadMerchantContext,
  loadSubscriptionContext,
  sendSponsoredTransaction,
  toFixed6Bn,
  toUnixSeconds,
} from "@/features/solana/renew-program.service";
import { getSolanaSettlementAuthorityKeypair } from "@/features/solana/solana-keypair.service";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

type ProtocolChargeExecutionInput =
  | {
      mode: "subscription_charge_success";
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
      merchantAddress: string;
      externalChargeId: string;
      commercialRef: string;
      localAmount: number;
      fxRate: number;
      amountUsdc: number;
    };

export async function executeProtocolSettlement(input: ProtocolChargeExecutionInput & {
  environment: RuntimeMode;
}) {
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
    const instruction =
      await context.runtime.program.methods
        .recordSubscriptionChargeSuccess(
          Array.from(externalChargeRefHash),
          new BN(billingPeriodStart),
          toFixed6Bn(input.localAmount),
          createFxQuoteArgs({
            externalRef: input.externalChargeId,
            providerRef: "yellow_card",
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
      instructions: [instruction],
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
  const instruction = await context.runtime.program.methods
    .recordInvoiceSettlement(
      Array.from(externalChargeRefHash),
      Array.from(hashProgramIdentifier(input.commercialRef, "invoice")),
      toFixed6Bn(input.localAmount),
      createFxQuoteArgs({
        externalRef: input.externalChargeId,
        providerRef: "yellow_card",
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
    instructions: [instruction],
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
