import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";

import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type ConfirmOptions,
  type Keypair,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import { getKoraConfig } from "@/config/kora.config";
import { getProtocolRuntimeConfig } from "@/config/protocol.config";
import { KoraClient } from "@solana/kora";
import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

const CONFIG_SEED = Buffer.from("config");
const MERCHANT_SEED = Buffer.from("merchant");
const MERCHANT_VAULT_SEED = Buffer.from("merchant-vault");
const LEDGER_SEED = Buffer.from("ledger");
const PLAN_SEED = Buffer.from("plan");
const SUBSCRIPTION_SEED = Buffer.from("subscription");
const CHARGE_SEED = Buffer.from("charge");
const CYCLE_SEED = Buffer.from("cycle");

type AnchorWallet = {
  publicKey: PublicKey;
  payer: Keypair;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

class KeypairWallet implements AnchorWallet {
  publicKey: PublicKey;
  payer: Keypair;

  constructor(readonly keypair: Keypair) {
    this.publicKey = keypair.publicKey;
    this.payer = keypair;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T) {
    if (tx instanceof VersionedTransaction) {
      tx.sign([this.keypair]);
      return tx;
    }

    tx.partialSign(this.keypair);
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]) {
    txs.forEach((tx) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([this.keypair]);
        return;
      }

      tx.partialSign(this.keypair);
    });
    return txs;
  }
}

function resolveIdlPath() {
  const candidates = [
    path.resolve(process.cwd(), "../contracts/target/idl/renew_protocol.json"),
    path.resolve(process.cwd(), "contracts/target/idl/renew_protocol.json"),
    path.resolve(__dirname, "../../../../contracts/target/idl/renew_protocol.json"),
  ];

  const idlPath = candidates.find((candidate) => existsSync(candidate));

  if (!idlPath) {
    throw new HttpError(
      503,
      "Renew Solana IDL was not found. Build the program before running protocol execution."
    );
  }

  return idlPath;
}

let cachedIdl: Idl | null = null;

function loadIdl() {
  if (cachedIdl) {
    return cachedIdl;
  }

  cachedIdl = JSON.parse(readFileSync(resolveIdlPath(), "utf8")) as Idl;
  return cachedIdl;
}

export function hashProgramIdentifier(value: string, scope: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new HttpError(400, `${scope} must not be empty.`);
  }

  const bytes = Buffer.from(trimmed, "utf8");

  if (bytes.length <= 32) {
    return Uint8Array.from(Buffer.concat([bytes, Buffer.alloc(32 - bytes.length)]));
  }

  return Uint8Array.from(
    createHash("sha256").update(`${scope}:${trimmed}`, "utf8").digest()
  );
}

export function deriveMerchantIdBytes(merchantId: string) {
  return hashProgramIdentifier(merchantId, "merchant");
}

export function toFixed6Bn(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new HttpError(400, "Amounts must be finite positive numbers.");
  }

  return new BN(Math.round(amount * 1_000_000));
}

export function toMicrosBn(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(400, "FX rates must be finite positive numbers.");
  }

  return new BN(Math.round(value * 1_000_000));
}

export function toUnixSeconds(value: Date | string | number) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Invalid timestamp.");
  }

  return Math.floor(date.getTime() / 1000);
}

function toBytes32Buffer(value: unknown, label: string) {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (Array.isArray(value)) {
    return Buffer.from(value);
  }

  throw new HttpError(502, `${label} account data could not be decoded.`);
}

type ProgramRuntime = {
  connection: Connection;
  provider: AnchorProvider;
  program: Program<Idl>;
  programId: PublicKey;
  settlementMint: PublicKey;
};

export function getRenewProgramRuntime(mode: RuntimeMode, authority: Keypair) {
  const protocolConfig = getProtocolRuntimeConfig(mode);

  if (!protocolConfig.programId.trim()) {
    throw new HttpError(503, "Renew Solana program id is not configured.");
  }

  if (!protocolConfig.settlementMintAddress.trim()) {
    throw new HttpError(503, "Renew settlement mint is not configured.");
  }

  const connection = new Connection(protocolConfig.rpcUrl, "confirmed");
  const provider = new AnchorProvider(
    connection,
    new KeypairWallet(authority),
    AnchorProvider.defaultOptions()
  );
  const program = new Program(loadIdl(), provider);
  const runtime = {
    connection,
    provider,
    program,
    programId: new PublicKey(protocolConfig.programId),
    settlementMint: new PublicKey(protocolConfig.settlementMintAddress),
  };

  return runtime;
}

export function findConfigPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

export function findLedgerPda(programId: PublicKey, merchantIdBytes: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [LEDGER_SEED, Buffer.from(merchantIdBytes)],
    programId
  )[0];
}

export function findMerchantPda(programId: PublicKey, merchantIdBytes: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [MERCHANT_SEED, Buffer.from(merchantIdBytes)],
    programId
  )[0];
}

export function findMerchantVaultPda(programId: PublicKey, merchantIdBytes: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [MERCHANT_VAULT_SEED, Buffer.from(merchantIdBytes)],
    programId
  )[0];
}

export function findPlanPda(
  programId: PublicKey,
  merchantIdBytes: Uint8Array,
  planCodeHash: Uint8Array
) {
  return PublicKey.findProgramAddressSync(
    [PLAN_SEED, Buffer.from(merchantIdBytes), Buffer.from(planCodeHash)],
    programId
  )[0];
}

export function findSubscriptionPda(
  programId: PublicKey,
  merchantIdBytes: Uint8Array,
  subscriptionRefHash: Uint8Array
) {
  return PublicKey.findProgramAddressSync(
    [SUBSCRIPTION_SEED, Buffer.from(merchantIdBytes), Buffer.from(subscriptionRefHash)],
    programId
  )[0];
}

export function findChargeReceiptPda(
  programId: PublicKey,
  merchantIdBytes: Uint8Array,
  externalChargeRefHash: Uint8Array
) {
  return PublicKey.findProgramAddressSync(
    [CHARGE_SEED, Buffer.from(merchantIdBytes), Buffer.from(externalChargeRefHash)],
    programId
  )[0];
}

export function findCycleMarkerPda(
  programId: PublicKey,
  subscriptionRefHash: Uint8Array,
  billingPeriodStart: number
) {
  const billingPeriodBytes = Buffer.alloc(8);
  billingPeriodBytes.writeBigInt64LE(BigInt(billingPeriodStart));

  return PublicKey.findProgramAddressSync(
    [CYCLE_SEED, Buffer.from(subscriptionRefHash), billingPeriodBytes],
    programId
  )[0];
}

export async function loadSubscriptionContext(mode: RuntimeMode, authority: Keypair, subscriptionPk: string) {
  const runtime = getRenewProgramRuntime(mode, authority);
  const accounts = runtime.program.account as unknown as Record<
    string,
    {
      fetch(address: PublicKey): Promise<unknown>;
    }
  >;
  const subscriptionAddress = new PublicKey(subscriptionPk);
  const subscription = await accounts.subscription.fetch(subscriptionAddress);
  const merchantAddress = new PublicKey((subscription as { merchant: PublicKey }).merchant);
  const merchant = await accounts.merchant.fetch(merchantAddress);
  const config = await accounts.config.fetch(findConfigPda(runtime.programId));

  const merchantId = toBytes32Buffer(
    (merchant as { merchantId: Uint8Array | number[] }).merchantId,
    "merchant_id"
  );
  const subscriptionRefHash = toBytes32Buffer(
    (subscription as { subscriptionRefHash: Uint8Array | number[] }).subscriptionRefHash,
    "subscription_ref_hash"
  );

  return {
    runtime,
    subscriptionAddress,
    subscription,
    merchantAddress,
    merchant,
    config,
    merchantId,
    subscriptionRefHash,
    merchantVault: new PublicKey(
      (merchant as { vaultTokenAccount: PublicKey }).vaultTokenAccount
    ),
    feeVault: new PublicKey((config as { feeVault: PublicKey }).feeVault),
    settlementSourceTokenAccount: getAssociatedTokenAddressSync(
      runtime.settlementMint,
      authority.publicKey
    ),
  };
}

export async function loadMerchantContext(mode: RuntimeMode, authority: Keypair, merchantPk: string) {
  const runtime = getRenewProgramRuntime(mode, authority);
  const accounts = runtime.program.account as unknown as Record<
    string,
    {
      fetch(address: PublicKey): Promise<unknown>;
    }
  >;
  const merchantAddress = new PublicKey(merchantPk);
  const merchant = await accounts.merchant.fetch(merchantAddress);
  const config = await accounts.config.fetch(findConfigPda(runtime.programId));
  const merchantId = toBytes32Buffer(
    (merchant as { merchantId: Uint8Array | number[] }).merchantId,
    "merchant_id"
  );

  return {
    runtime,
    merchantAddress,
    merchant,
    config,
    merchantId,
    ledgerAddress: findLedgerPda(runtime.programId, merchantId),
    merchantVault: new PublicKey(
      (merchant as { vaultTokenAccount: PublicKey }).vaultTokenAccount
    ),
    feeVault: new PublicKey((config as { feeVault: PublicKey }).feeVault),
    settlementSourceTokenAccount: getAssociatedTokenAddressSync(
      runtime.settlementMint,
      authority.publicKey
    ),
  };
}

export function createFxQuoteArgs(input: {
  externalRef: string;
  providerRef: string;
  fxRate: number;
  generatedAt?: Date | string | number;
  expiresAt?: Date | string | number;
}) {
  const generatedAt = toUnixSeconds(input.generatedAt ?? new Date());
  const expiresAt = toUnixSeconds(
    input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000)
  );

  return {
    fxRateInMicros: toMicrosBn(input.fxRate),
    fxQuoteRefHash: Array.from(hashProgramIdentifier(input.externalRef, "fx_quote")),
    fxProviderRefHash: Array.from(hashProgramIdentifier(input.providerRef, "fx_provider")),
    quoteGeneratedAt: new BN(generatedAt),
    quoteExpiresAt: new BN(expiresAt),
  };
}

async function getKoraClient(mode: RuntimeMode) {
  const koraConfig = getKoraConfig(mode);

  if (!koraConfig.enabled) {
    return null;
  }

  return new KoraClient({
    rpcUrl: koraConfig.rpcUrl,
    apiKey: koraConfig.apiKey || undefined,
    hmacSecret: koraConfig.hmacSecret || undefined,
  });
}

export async function getSponsoredTransactionContext(input: {
  mode: RuntimeMode;
  fallbackFeePayer: PublicKey;
}) {
  const runtime = getProtocolRuntimeConfig(input.mode);
  const kora = await getKoraClient(input.mode);

  if (!kora) {
    const connection = new Connection(runtime.rpcUrl, "confirmed");
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");

    return {
      blockhash: latestBlockhash.blockhash,
      feePayer: input.fallbackFeePayer,
      sponsored: false,
    };
  }

  const [blockhash, payer] = await Promise.all([
    kora.getBlockhash(),
    kora.getPayerSigner(),
  ]);

  return {
    blockhash: blockhash.blockhash,
    feePayer: new PublicKey(payer.signer_address),
    sponsored: true,
  };
}

export async function sendSerializedSponsoredTransaction(input: {
  mode: RuntimeMode;
  transactionBase64: string;
}) {
  const kora = await getKoraClient(input.mode);

  if (!kora) {
    const runtimeConfig = getProtocolRuntimeConfig(input.mode);
    const connection = new Connection(runtimeConfig.rpcUrl, "confirmed");
    const signature = await connection.sendRawTransaction(
      Buffer.from(input.transactionBase64, "base64")
    );
    await connection.confirmTransaction(signature, "confirmed");

    return {
      signature,
      sponsored: false,
    };
  }

  const response = await kora.signAndSendTransaction({
    transaction: input.transactionBase64,
  });

  return {
    signature: response.signature,
    sponsored: true,
  };
}

export async function sendSponsoredTransaction(input: {
  mode: RuntimeMode;
  authority: Keypair;
  instructions: TransactionInstruction[];
  signers?: Keypair[];
}) {
  const runtime = getRenewProgramRuntime(input.mode, input.authority);
  const sponsoredContext = await getSponsoredTransactionContext({
    mode: input.mode,
    fallbackFeePayer: input.authority.publicKey,
  });

  const transaction = new Transaction({
    feePayer: sponsoredContext.feePayer,
    recentBlockhash: sponsoredContext.blockhash,
  }).add(...input.instructions);

  const signers = [input.authority, ...(input.signers ?? [])];
  transaction.partialSign(...signers);

  return sendSerializedSponsoredTransaction({
    mode: input.mode,
    transactionBase64: transaction
      .serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
      .toString("base64"),
  });
}
