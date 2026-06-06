import { createHash } from "node:crypto";

import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

import { getStellarSettlementConfig } from "@/features/settlement/providers/stellar/config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { isStellarAddress } from "@/shared/constants/stellar";
import { HttpError } from "@/shared/errors/http-error";

export type StellarVaultAccountConfigInput = {
  environment?: RuntimeMode | string | null;
  mode?: string | null;
  provider?: string | null;
  chain?: string | null;
  assetSymbol?: string | null;
  destinationAddress?: string | null;
  status?: string | null;
};

export type StellarVaultDepositInput = {
  payoutId: string;
  merchantId: string;
  environment: RuntimeMode;
  accountId: string;
  amount: number;
  destinationAddress: string;
  releaseAt: Date;
};

export type StellarVaultReleaseInput = {
  environment: RuntimeMode;
  vaultBatchId: string;
};

export type StellarVaultTransactionResult = {
  txHash: string;
  status: "SUCCESS";
  ledger: number;
};

export type StellarVaultDepositResult = StellarVaultTransactionResult & {
  vaultBatchId: string;
  releaseAt: Date;
};

const ledgerSafetyDelaySeconds = 10;
const stellarUsdcTokenUnits = 10_000_000;
const stellarUsdcDecimals = 7;

export function assertStellarVaultAccountConfig(
  input: StellarVaultAccountConfigInput
) {
  if (input.mode && input.mode !== "standard") {
    throw new HttpError(400, "Stellar settlement uses standard mode.");
  }

  if (input.provider && input.provider !== "stellar_vault") {
    throw new HttpError(400, "Settlement provider must be Stellar vault.");
  }

  if (input.chain && input.chain !== "stellar") {
    throw new HttpError(400, "Settlement network must be Stellar.");
  }

  if ((input.assetSymbol ?? "USDC").trim().toUpperCase() !== "USDC") {
    throw new HttpError(400, "Stellar settlement currently supports USDC.");
  }

  if (!input.destinationAddress) {
    throw new HttpError(400, "A Stellar payout wallet is required.");
  }

  if (!isStellarAddress(input.destinationAddress)) {
    throw new HttpError(400, "Payout wallet must be a valid Stellar address.");
  }

  return {
    symbol: "USDC" as const,
    decimals: stellarUsdcDecimals,
  };
}

export function assertStellarVaultConfigured(mode: RuntimeMode) {
  const config = getStellarSettlementConfig(mode);

  if (!config.rpcUrl) {
    throw new HttpError(409, "Stellar RPC URL is required for this environment.");
  }

  if (!config.networkPassphrase) {
    throw new HttpError(
      409,
      "Stellar network passphrase is required for this environment."
    );
  }

  if (!config.vaultContractId) {
    throw new HttpError(
      409,
      "Stellar settlement vault contract is required for this environment."
    );
  }

  if (!config.usdcContractId) {
    throw new HttpError(
      409,
      "Stellar USDC contract is required for this environment."
    );
  }

  if (!config.operatorSecret) {
    throw new HttpError(
      409,
      "Stellar settlement operator key is required for this environment."
    );
  }

  return config;
}

export function createStellarVaultBatchId(input: {
  environment: RuntimeMode;
  payoutId: string;
  merchantId: string;
  accountId: string;
  amount: number;
  destinationAddress: string;
}) {
  return createHash("sha256")
    .update(
      [
        input.environment,
        input.payoutId,
        input.merchantId,
        input.accountId,
        input.amount.toFixed(stellarUsdcDecimals),
        input.destinationAddress,
      ].join(":")
    )
    .digest("hex");
}

function createMetadataHash(input: StellarVaultDepositInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        payoutId: input.payoutId,
        merchantId: input.merchantId,
        accountId: input.accountId,
        amount: input.amount,
        destinationAddress: input.destinationAddress,
        releaseAt: input.releaseAt.toISOString(),
      })
    )
    .digest();
}

function bytes32ToScVal(hexValue: string) {
  const bytes = Buffer.from(hexValue, "hex");

  if (bytes.length !== 32) {
    throw new HttpError(400, "Stellar vault batch id must be 32 bytes.");
  }

  return xdr.ScVal.scvBytes(bytes);
}

function amountToTokenUnits(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Stellar vault amount must be positive.");
  }

  return BigInt(Math.round(amount * stellarUsdcTokenUnits));
}

function releaseAtToUnixSeconds(releaseAt: Date) {
  const requested = Math.floor(releaseAt.getTime() / 1000);
  const nextLedgerSafeTime =
    Math.floor(Date.now() / 1000) + ledgerSafetyDelaySeconds;

  return BigInt(Math.max(requested, nextLedgerSafeTime));
}

async function submitVaultInvocation(input: {
  environment: RuntimeMode;
  method: string;
  args: xdr.ScVal[];
}): Promise<StellarVaultTransactionResult> {
  const config = assertStellarVaultConfigured(input.environment);
  const server = new rpc.Server(config.rpcUrl);
  const operatorKeypair = Keypair.fromSecret(config.operatorSecret);
  const operatorAccount = await server.getAccount(operatorKeypair.publicKey());
  const contract = new Contract(config.vaultContractId);
  const transaction = new TransactionBuilder(operatorAccount, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(input.method, ...input.args))
    .setTimeout(60)
    .build();
  const preparedTransaction = await server.prepareTransaction(transaction);
  preparedTransaction.sign(operatorKeypair);
  const submittedTransaction = await server.sendTransaction(preparedTransaction);

  if (
    submittedTransaction.status !== "PENDING" &&
    submittedTransaction.status !== "DUPLICATE"
  ) {
    throw new HttpError(
      502,
      `Stellar vault transaction was not accepted: ${submittedTransaction.status}.`
    );
  }

  const confirmedTransaction = await server.pollTransaction(
    submittedTransaction.hash,
    { attempts: 20 }
  );

  if (confirmedTransaction.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new HttpError(
      502,
      `Stellar vault transaction did not complete successfully: ${confirmedTransaction.status}.`
    );
  }

  return {
    txHash: confirmedTransaction.txHash,
    status: "SUCCESS",
    ledger: confirmedTransaction.ledger,
  };
}

export async function depositToStellarVault(
  input: StellarVaultDepositInput
): Promise<StellarVaultDepositResult> {
  const vaultBatchId = createStellarVaultBatchId(input);
  const releaseAtUnixSeconds = releaseAtToUnixSeconds(input.releaseAt);
  const result = await submitVaultInvocation({
    environment: input.environment,
    method: "deposit",
    args: [
      bytes32ToScVal(vaultBatchId),
      Address.fromString(input.destinationAddress).toScVal(),
      nativeToScVal(amountToTokenUnits(input.amount), { type: "i128" }),
      nativeToScVal(releaseAtUnixSeconds, { type: "u64" }),
      xdr.ScVal.scvBytes(createMetadataHash(input)),
    ],
  });

  return {
    vaultBatchId,
    txHash: result.txHash,
    status: result.status,
    ledger: result.ledger,
    releaseAt: new Date(Number(releaseAtUnixSeconds) * 1000),
  };
}

export async function releaseStellarVaultBatch(input: StellarVaultReleaseInput) {
  return submitVaultInvocation({
    environment: input.environment,
    method: "release",
    args: [bytes32ToScVal(input.vaultBatchId)],
  });
}
