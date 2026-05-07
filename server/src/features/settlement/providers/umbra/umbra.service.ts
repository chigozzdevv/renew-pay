import {
  createSignerFromPrivateKeyBytes,
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction,
  getUmbraClient,
} from "@umbra-privacy/sdk";
import type { GetUmbraClientArgs } from "@umbra-privacy/sdk";
import type { U64 } from "@umbra-privacy/sdk/types";
import { getCreateReceiverClaimableUtxoFromPublicBalanceProver } from "@umbra-privacy/web-zk-prover";

import { getUmbraConfig } from "@/config/umbra.config";
import {
  getUmbraSettlementAsset,
} from "@/features/settlement/providers/umbra/umbra.assets";
import type {
  BuildUmbraRoutePrivacyInput,
  UmbraPayoutExecutionInput,
  UmbraPayoutExecutionResult,
  UmbraRouteConfigInput,
  UmbraRoutePrivacy,
} from "@/features/settlement/providers/umbra/umbra.types";
import { isSolanaAddress } from "@/shared/constants/solana";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

type UmbraNetwork = GetUmbraClientArgs["network"];
type CreateReceiverClaimableUtxoFunction = ReturnType<
  typeof getPublicBalanceToReceiverClaimableUtxoCreatorFunction
>;
type CreateReceiverClaimableUtxoArgs = Parameters<
  CreateReceiverClaimableUtxoFunction
>[0];

const clients = new Map<RuntimeMode, Promise<Awaited<ReturnType<typeof getUmbraClient>>>>();

function parsePrivateKey(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;

    if (
      !Array.isArray(parsed) ||
      !parsed.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)
    ) {
      throw new HttpError(500, "Umbra settlement private key is invalid.");
    }

    return new Uint8Array(parsed as number[]);
  }

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    return new Uint8Array(Buffer.from(trimmed, "hex"));
  }

  return new Uint8Array(Buffer.from(trimmed, "base64"));
}

function getRuntimeMode(value?: string | null): RuntimeMode {
  return value === "live" ? "live" : "test";
}

export function assertUmbraConfigured(mode: RuntimeMode) {
  const config = getUmbraConfig(mode);
  const keyBytes = parsePrivateKey(config.settlementPrivateKey);

  if (!keyBytes || keyBytes.length === 0) {
    throw new HttpError(
      409,
      "Umbra settlement private key is required for this environment."
    );
  }

  if (!config.rpcUrl || !config.rpcSubscriptionsUrl) {
    throw new HttpError(
      409,
      "Solana RPC and WebSocket URLs are required for this environment."
    );
  }

  return {
    ...config,
    settlementPrivateKeyBytes: keyBytes,
  };
}

export function assertUmbraRouteConfig(input: UmbraRouteConfigInput) {
  const asset = input.assetSymbol
    ? getUmbraSettlementAsset(input.assetSymbol)
    : null;

  if (input.mode !== "private") {
    throw new HttpError(400, "Umbra routes must use private mode.");
  }

  if (input.chain !== "solana") {
    throw new HttpError(400, "Umbra routes are only available on Solana.");
  }

  if (!asset) {
    throw new HttpError(
      400,
      "Umbra settlement currently supports USDC on Solana."
    );
  }

  if (input.assetMint && input.assetMint !== asset.mint) {
    throw new HttpError(400, "Umbra USDC routes must use the USDC mint.");
  }

  if (
    input.assetDecimals !== undefined &&
    input.assetDecimals !== null &&
    input.assetDecimals !== asset.decimals
  ) {
    throw new HttpError(400, "Umbra USDC routes must use 6 decimals.");
  }

  if (!input.destinationAddress) {
    throw new HttpError(
      400,
      "Umbra settlement routes require a recipient wallet address."
    );
  }

  if (!isSolanaAddress(input.destinationAddress)) {
    throw new HttpError(400, "Destination must be a valid Solana address.");
  }

  if (input.status !== "disabled") {
    assertUmbraConfigured(getRuntimeMode(input.environment));
  }

  return asset;
}

export function buildUmbraRoutePrivacy(
  input: BuildUmbraRoutePrivacyInput
): UmbraRoutePrivacy {
  const asset = getUmbraSettlementAsset(input.assetSymbol);
  const poolMint = input.assetMint ?? asset?.mint ?? null;

  if (!poolMint) {
    throw new HttpError(
      400,
      "Umbra settlement currently supports USDC on Solana."
    );
  }

  return {
    provider: "umbra",
    strategy: "receiver_claimable_utxo",
    poolMint,
    viewingKeyPolicy: "merchant_controlled",
  };
}

function amountToAtomicUnits(amount: number, decimals: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Umbra payout amount must be positive.");
  }

  const fixed = amount.toFixed(decimals);
  const [whole, fraction = ""] = fixed.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");

  if (units <= 0n) {
    throw new HttpError(400, "Umbra payout amount is too small.");
  }

  return units as U64;
}

async function getUmbraSettlementClient(mode: RuntimeMode) {
  const existing = clients.get(mode);

  if (existing) {
    return existing;
  }

  const clientPromise = (async () => {
    const config = assertUmbraConfigured(mode);
    const signer = await createSignerFromPrivateKeyBytes(
      config.settlementPrivateKeyBytes
    );

    return getUmbraClient({
      signer,
      network: config.network as UmbraNetwork,
      rpcUrl: config.rpcUrl,
      rpcSubscriptionsUrl: config.rpcSubscriptionsUrl,
      indexerApiEndpoint: config.indexerApiEndpoint,
      deferMasterSeedSignature: true,
    });
  })();

  clients.set(mode, clientPromise);

  return clientPromise;
}

export async function executeUmbraPayout(
  input: UmbraPayoutExecutionInput
): Promise<UmbraPayoutExecutionResult> {
  const asset = assertUmbraRouteConfig({
    environment: input.environment,
    mode: "private",
    chain: "solana",
    assetSymbol: input.assetSymbol,
    assetMint: input.assetMint,
    assetDecimals: input.assetDecimals,
    destinationAddress: input.destinationAddress,
    status: "active",
  });
  const client = await getUmbraSettlementClient(input.environment);
  const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
    { client },
    { zkProver: getCreateReceiverClaimableUtxoFromPublicBalanceProver() }
  );
  const result = await createUtxo({
    amount: amountToAtomicUnits(input.amount, asset.decimals),
    destinationAddress:
      input.destinationAddress as CreateReceiverClaimableUtxoArgs["destinationAddress"],
    mint: asset.mint as CreateReceiverClaimableUtxoArgs["mint"],
  });

  return {
    status: "settled",
    txHash: result.createUtxoSignature,
    createProofAccountTxHash: result.createProofAccountSignature,
    closeProofAccountTxHash: result.closeProofAccountSignature ?? null,
    settledAt: new Date(),
  };
}
