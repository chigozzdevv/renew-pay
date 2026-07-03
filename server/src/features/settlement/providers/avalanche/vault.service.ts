import { createHash } from "node:crypto";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  avalancheErc20Abi,
  renewVaultAbi,
} from "@/features/settlement/providers/avalanche/abi";
import { getAvalancheSettlementConfig } from "@/features/settlement/providers/avalanche/config";
import { isEvmAddress, normalizeEvmAddress } from "@/shared/constants/address";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

export type VaultAccountConfigInput = {
  environment?: RuntimeMode | string | null;
  mode?: string | null;
  provider?: string | null;
  chain?: string | null;
  assetSymbol?: string | null;
  destinationAddress?: string | null;
  status?: string | null;
};

export type VaultDepositInput = {
  payoutId: string;
  merchantId: string;
  environment: RuntimeMode;
  accountId: string;
  amount: number;
  destinationAddress: string;
  releaseAt: Date;
};

export type VaultReleaseInput = {
  environment: RuntimeMode;
  vaultBatchId: string;
};

export type VaultTransactionResult = {
  txHash: string;
  status: "SUCCESS";
  ledger: number;
};

export type VaultDepositResult = VaultTransactionResult & {
  vaultBatchId: string;
  releaseAt: Date;
};

const usdcDecimals = 6;
const evmPrivateKeyRegex = /^0x[a-fA-F0-9]{64}$/;
const bytes32Regex = /^[a-fA-F0-9]{64}$/;
export const settlementVaultProvider = "renew_vault";
const legacySettlementVaultProvider = "avalanche_vault";

export function isSettlementVaultProvider(value: string | null | undefined) {
  const provider = value?.trim();

  return (
    provider === settlementVaultProvider ||
    provider === legacySettlementVaultProvider
  );
}

export function assertVaultAccountConfig(input: VaultAccountConfigInput) {
  if (input.mode && input.mode !== "standard") {
    throw new HttpError(400, "Settlement uses standard mode.");
  }

  if (input.provider && !isSettlementVaultProvider(input.provider)) {
    throw new HttpError(400, "Settlement provider must be Renew vault.");
  }

  if (input.chain && input.chain !== "avalanche") {
    throw new HttpError(400, "Settlement network must be Avalanche.");
  }

  if ((input.assetSymbol ?? "USDC").trim().toUpperCase() !== "USDC") {
    throw new HttpError(400, "Settlement currently supports USDC.");
  }

  if (!input.destinationAddress) {
    throw new HttpError(400, "A payout wallet is required.");
  }

  if (!isEvmAddress(input.destinationAddress)) {
    throw new HttpError(400, "Payout wallet must be a valid wallet address.");
  }

  return {
    symbol: "USDC" as const,
    decimals: usdcDecimals,
  };
}

export function assertVaultConfigured(mode: RuntimeMode) {
  const config = getAvalancheSettlementConfig(mode);

  if (!config.rpcUrl) {
    throw new HttpError(409, "Avalanche RPC URL is required for this environment.");
  }

  if (!config.usdcContractAddress) {
    throw new HttpError(409, "Avalanche USDC contract is required.");
  }

  if (!config.vaultContractAddress) {
    throw new HttpError(409, "Avalanche settlement vault is required.");
  }

  if (!config.operatorPrivateKey) {
    throw new HttpError(409, "Avalanche settlement operator key is required.");
  }

  return config;
}

function assertConfigAddress(value: string, message: string) {
  const normalized = normalizeEvmAddress(value);

  if (!normalized) {
    throw new HttpError(409, message);
  }

  return normalized as Address;
}

function normalizePrivateKey(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;

  if (!evmPrivateKeyRegex.test(normalized)) {
    throw new HttpError(
      409,
      "Avalanche settlement operator key must be a 32-byte hex private key."
    );
  }

  return normalized as Hex;
}

function createAvalancheChain(input: {
  chainId: number;
  rpcUrl: string;
  environment: RuntimeMode;
}) {
  return defineChain({
    id: input.chainId,
    name:
      input.environment === "live"
        ? "Avalanche C-Chain"
        : "Avalanche Fuji C-Chain",
    nativeCurrency: {
      name: "Avalanche",
      symbol: "AVAX",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [input.rpcUrl],
      },
    },
  });
}

function createAvalancheVaultClients(environment: RuntimeMode) {
  const config = assertVaultConfigured(environment);
  const account = privateKeyToAccount(normalizePrivateKey(config.operatorPrivateKey));
  const chain = createAvalancheChain({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    environment,
  });
  const transport = http(config.rpcUrl);

  return {
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
    usdcAddress: assertConfigAddress(
      config.usdcContractAddress,
      "Avalanche USDC contract must be a valid wallet address."
    ),
    vaultAddress: assertConfigAddress(
      config.vaultContractAddress,
      "Avalanche settlement vault must be a valid wallet address."
    ),
  };
}

export function createVaultBatchId(input: {
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
        input.amount.toFixed(usdcDecimals),
        input.destinationAddress.toLowerCase(),
      ].join(":")
    )
    .digest("hex");
}

function amountToTokenUnits(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Avalanche vault amount must be positive.");
  }

  const [whole, fraction = ""] = amount.toFixed(usdcDecimals).split(".");

  return (
    BigInt(whole) * 10n ** BigInt(usdcDecimals) +
    BigInt(fraction.padEnd(usdcDecimals, "0").slice(0, usdcDecimals))
  );
}

function releaseAtToUnixSeconds(releaseAt: Date) {
  if (Number.isNaN(releaseAt.getTime())) {
    throw new HttpError(400, "Avalanche vault release time is invalid.");
  }

  return BigInt(Math.floor(releaseAt.getTime() / 1000));
}

function bytes32Hex(value: string, message: string) {
  if (!bytes32Regex.test(value)) {
    throw new HttpError(400, message);
  }

  return `0x${value.toLowerCase()}` as Hex;
}

function createMetadataHash(input: VaultDepositInput) {
  return `0x${createHash("sha256")
    .update(
      JSON.stringify({
        payoutId: input.payoutId,
        merchantId: input.merchantId,
        accountId: input.accountId,
        amount: input.amount.toFixed(usdcDecimals),
        destinationAddress: input.destinationAddress.toLowerCase(),
        releaseAt: input.releaseAt.toISOString(),
      })
    )
    .digest("hex")}` as Hex;
}

export async function depositToVault(
  input: VaultDepositInput
): Promise<VaultDepositResult> {
  const {
    publicClient,
    walletClient,
    usdcAddress,
    vaultAddress,
  } = createAvalancheVaultClients(input.environment);
  const vaultBatchId = createVaultBatchId(input);
  const amount = amountToTokenUnits(input.amount);
  const releaseAtUnixSeconds = releaseAtToUnixSeconds(input.releaseAt);
  const destinationAddress = assertConfigAddress(
    input.destinationAddress,
    "Payout wallet must be a valid wallet address."
  );
  const batchId = bytes32Hex(vaultBatchId, "Avalanche vault batch id must be 32 bytes.");
  const metadataHash = createMetadataHash(input);

  const approvalHash = await walletClient.writeContract({
    address: usdcAddress,
    abi: avalancheErc20Abi,
    functionName: "approve",
    args: [vaultAddress, amount],
  });
  const approvalReceipt = await publicClient.waitForTransactionReceipt({
    hash: approvalHash,
  });

  if (approvalReceipt.status !== "success") {
    throw new HttpError(502, "Avalanche USDC approval transaction reverted.");
  }

  const depositHash = await walletClient.writeContract({
    address: vaultAddress,
    abi: renewVaultAbi,
    functionName: "deposit",
    args: [
      batchId,
      destinationAddress,
      amount,
      releaseAtUnixSeconds,
      metadataHash,
    ],
  });
  const depositReceipt = await publicClient.waitForTransactionReceipt({
    hash: depositHash,
  });

  if (depositReceipt.status !== "success") {
    throw new HttpError(502, "Avalanche vault deposit transaction reverted.");
  }

  return {
    vaultBatchId,
    txHash: depositHash,
    status: "SUCCESS",
    ledger: Number(depositReceipt.blockNumber),
    releaseAt: new Date(Number(releaseAtUnixSeconds) * 1000),
  };
}

export async function releaseVaultBatch(
  input: VaultReleaseInput
): Promise<VaultTransactionResult> {
  const { publicClient, walletClient, vaultAddress } = createAvalancheVaultClients(
    input.environment
  );
  const batchId = bytes32Hex(
    input.vaultBatchId,
    "Avalanche vault batch id must be 32 bytes."
  );
  const releaseHash = await walletClient.writeContract({
    address: vaultAddress,
    abi: renewVaultAbi,
    functionName: "release",
    args: [batchId],
  });
  const releaseReceipt = await publicClient.waitForTransactionReceipt({
    hash: releaseHash,
  });

  if (releaseReceipt.status !== "success") {
    throw new HttpError(502, "Avalanche vault release transaction reverted.");
  }

  return {
    txHash: releaseHash,
    status: "SUCCESS",
    ledger: Number(releaseReceipt.blockNumber),
  };
}

export const __test__ = {
  amountToTokenUnits,
  bytes32Hex,
  createMetadataHash,
};
