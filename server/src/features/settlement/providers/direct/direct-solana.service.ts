import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";

import { getSolanaSettlementConfig } from "@/config/solana.config";
import {
  getDirectSolanaSettlementAsset,
} from "@/features/settlement/providers/direct/direct.assets";
import type {
  DirectSolanaPayoutExecutionInput,
  DirectSolanaPayoutExecutionResult,
  DirectSolanaRouteConfigInput,
} from "@/features/settlement/providers/direct/direct.types";
import { isSolanaAddress } from "@/shared/constants/solana";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

const connections = new Map<RuntimeMode, Connection>();

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
      throw new HttpError(500, "Solana settlement private key is invalid.");
    }

    return new Uint8Array(parsed as number[]);
  }

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    return new Uint8Array(Buffer.from(trimmed, "hex"));
  }

  try {
    return bs58.decode(trimmed);
  } catch {
    return new Uint8Array(Buffer.from(trimmed, "base64"));
  }
}

function getRuntimeMode(value?: string | null): RuntimeMode {
  return value === "live" ? "live" : "test";
}

function amountToAtomicUnits(amount: number, decimals: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "Settlement amount must be positive.");
  }

  const fixed = amount.toFixed(decimals);
  const [whole, fraction = ""] = fixed.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");

  if (units <= 0n) {
    throw new HttpError(400, "Settlement amount is too small.");
  }

  return units;
}

export function resolveDirectSolanaAsset(input: {
  assetSymbol?: string | null;
  assetMint?: string | null;
  assetDecimals?: number | null;
}) {
  const symbol = input.assetSymbol?.trim().toUpperCase() || "USDC";
  const knownAsset = getDirectSolanaSettlementAsset(symbol);
  const mint = input.assetMint?.trim() || knownAsset?.mint || null;
  const decimals = input.assetDecimals ?? knownAsset?.decimals ?? 6;

  return {
    symbol,
    mint,
    decimals,
  };
}

export function assertDirectSolanaConfigured(mode: RuntimeMode) {
  const config = getSolanaSettlementConfig(mode);
  const keyBytes = parsePrivateKey(config.settlementPrivateKey);

  if (!keyBytes || keyBytes.length === 0) {
    throw new HttpError(
      409,
      "Solana settlement private key is required for this environment."
    );
  }

  if (!config.rpcUrl) {
    throw new HttpError(
      409,
      "Solana RPC URL is required for this environment."
    );
  }

  return {
    ...config,
    settlementPrivateKeyBytes: keyBytes,
  };
}

export function assertDirectSolanaRouteConfig(
  input: DirectSolanaRouteConfigInput
) {
  if (input.provider !== "direct") {
    throw new HttpError(400, "Standard Solana settlement routes must use direct provider.");
  }

  if (input.mode !== "standard") {
    throw new HttpError(400, "Direct Solana routes must use standard mode.");
  }

  if (input.chain !== "solana") {
    throw new HttpError(400, "Direct automated settlement is only available on Solana.");
  }

  const asset = resolveDirectSolanaAsset(input);

  if (!asset.mint) {
    throw new HttpError(
      400,
      "Direct Solana settlement routes require an SPL token mint."
    );
  }

  if (!isSolanaAddress(asset.mint)) {
    throw new HttpError(400, "Settlement asset mint must be a valid Solana address.");
  }

  if (!input.destinationAddress) {
    throw new HttpError(
      400,
      "Direct Solana settlement routes require a destination wallet."
    );
  }

  if (!isSolanaAddress(input.destinationAddress)) {
    throw new HttpError(400, "Destination must be a valid Solana address.");
  }

  if (input.status !== "disabled") {
    assertDirectSolanaConfigured(getRuntimeMode(input.environment));
  }

  return asset;
}

function getDirectSolanaConnection(mode: RuntimeMode) {
  const existing = connections.get(mode);

  if (existing) {
    return existing;
  }

  const config = getSolanaSettlementConfig(mode);
  const connection = new Connection(config.rpcUrl, "confirmed");
  connections.set(mode, connection);

  return connection;
}

function getDirectSolanaSigner(mode: RuntimeMode) {
  const config = assertDirectSolanaConfigured(mode);

  try {
    return Keypair.fromSecretKey(config.settlementPrivateKeyBytes);
  } catch {
    throw new HttpError(500, "Solana settlement private key is invalid.");
  }
}

async function getTokenProgramId(connection: Connection, mint: PublicKey) {
  const mintAccount = await connection.getAccountInfo(mint, "confirmed");

  if (!mintAccount) {
    throw new HttpError(409, "Settlement asset mint was not found on Solana.");
  }

  if (
    !mintAccount.owner.equals(TOKEN_PROGRAM_ID) &&
    !mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)
  ) {
    throw new HttpError(409, "Settlement asset mint is not an SPL token mint.");
  }

  return mintAccount.owner;
}

export async function executeDirectSolanaPayout(
  input: DirectSolanaPayoutExecutionInput
): Promise<DirectSolanaPayoutExecutionResult> {
  const asset = assertDirectSolanaRouteConfig({
    environment: input.environment,
    mode: "standard",
    provider: "direct",
    chain: "solana",
    assetSymbol: input.assetSymbol,
    assetMint: input.assetMint,
    assetDecimals: input.assetDecimals,
    destinationAddress: input.destinationAddress,
    status: "active",
  });
  const mintAddress = asset.mint;

  if (!mintAddress) {
    throw new HttpError(400, "Direct Solana settlement routes require an SPL token mint.");
  }

  const connection = getDirectSolanaConnection(input.environment);
  const signer = getDirectSolanaSigner(input.environment);
  const mint = new PublicKey(mintAddress);
  const destinationOwner = new PublicKey(input.destinationAddress);
  const tokenProgramId = await getTokenProgramId(connection, mint);
  const sourceTokenAccount = getAssociatedTokenAddressSync(
    mint,
    signer.publicKey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    mint,
    destinationOwner,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const sourceAccount = await connection.getAccountInfo(
    sourceTokenAccount,
    "confirmed"
  );

  if (!sourceAccount) {
    throw new HttpError(409, "Settlement wallet does not hold this token.");
  }

  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      signer.publicKey,
      destinationTokenAccount,
      destinationOwner,
      mint,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createTransferCheckedInstruction(
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
      signer.publicKey,
      amountToAtomicUnits(input.amount, asset.decimals),
      asset.decimals,
      [],
      tokenProgramId
    )
  );
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [signer],
    {
      commitment: "confirmed",
    }
  );

  return {
    status: "settled",
    txHash: signature,
    settledAt: new Date(),
  };
}
