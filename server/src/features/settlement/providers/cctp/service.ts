import {
  Connection,
  Keypair as SolanaKeypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { avalancheCctpMessageTransmitterAbi } from "@/features/settlement/providers/avalanche/abi";
import { getCctpSettlementConfig } from "@/features/settlement/providers/cctp/config";
import { normalizeEvmAddress } from "@/shared/constants/address";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

type CctpBridgeState = {
  sourceTxHash?: string | null;
  receiveTxHash?: string | null;
  message?: string | null;
  attestation?: string | null;
};

type CctpBridgeInput = CctpBridgeState & {
  environment: RuntimeMode;
  amount: number;
};

type CircleAttestationMessage = {
  status?: string;
  message?: string;
  attestation?: string;
};

type CircleAttestationResponse = {
  messages?: CircleAttestationMessage[];
};

const depositForBurnWithHookDiscriminator = Buffer.from([
  111, 245, 62, 131, 204, 108, 223, 155,
]);

const collectionAssetDecimals = 6;
const evmPrivateKeyRegex = /^0x[a-fA-F0-9]{64}$/;
const hexBytesRegex = /^(0x)?[a-fA-F0-9]+$/;

function assertNonEmpty(value: string | null | undefined, message: string) {
  if (!value?.trim()) {
    throw new HttpError(409, message);
  }

  return value.trim();
}

async function parseSolanaCollectionKeypair(privateKey: string) {
  const trimmed = assertNonEmpty(
    privateKey,
    "Collection private key is required for CCTP settlement."
  );

  try {
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        !Array.isArray(parsed) ||
        parsed.some((value) => !Number.isInteger(value))
      ) {
        throw new Error("Invalid JSON keypair.");
      }

      return SolanaKeypair.fromSecretKey(Uint8Array.from(parsed as number[]));
    }

    const { default: bs58 } = await import("bs58");

    return SolanaKeypair.fromSecretKey(bs58.decode(trimmed));
  } catch {
    try {
      return SolanaKeypair.fromSecretKey(Buffer.from(trimmed, "base64"));
    } catch {
      throw new HttpError(
        409,
        "Collection private key must be a base58 secret key, base64 secret key, or JSON keypair array."
      );
    }
  }
}

function amountToSourceTokenUnits(amount: number, options?: { allowZero?: boolean }) {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    (!options?.allowZero && amount === 0)
  ) {
    throw new HttpError(400, "CCTP settlement amount must be positive.");
  }

  const [whole, fraction = ""] = amount.toFixed(collectionAssetDecimals).split(".");

  return (
    BigInt(whole) * 10n ** BigInt(collectionAssetDecimals) +
    BigInt(
      fraction
        .padEnd(collectionAssetDecimals, "0")
        .slice(0, collectionAssetDecimals)
    )
  );
}

function normalizePrivateKey(value: string) {
  const trimmed = assertNonEmpty(
    value,
    "Avalanche settlement operator key is required."
  );
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;

  if (!evmPrivateKeyRegex.test(normalized)) {
    throw new HttpError(
      409,
      "Avalanche settlement operator key must be a 32-byte hex private key."
    );
  }

  return normalized as Hex;
}

function assertEvmAddress(value: string, message: string) {
  const normalized = normalizeEvmAddress(value);

  if (!normalized) {
    throw new HttpError(409, message);
  }

  return normalized as Address;
}

function stripHexPrefix(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function hexBytes(value: string, message: string) {
  const trimmed = value.trim();

  if (
    !trimmed ||
    !hexBytesRegex.test(trimmed) ||
    stripHexPrefix(trimmed).length % 2 !== 0
  ) {
    throw new HttpError(409, message);
  }

  return `0x${stripHexPrefix(trimmed).toLowerCase()}` as Hex;
}

function u64Le(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function u32Le(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function encodeAnchorBytes(value: Buffer) {
  return Buffer.concat([u32Le(value.length), value]);
}

function findProgramAddress(
  label: string,
  programId: PublicKey,
  extraSeeds: (string | Buffer | PublicKey)[] = []
) {
  const seeds: Uint8Array[] = [Buffer.from(label, "utf8")];

  for (const seed of extraSeeds) {
    if (typeof seed === "string") {
      seeds.push(Buffer.from(seed, "utf8"));
    } else if (Buffer.isBuffer(seed)) {
      seeds.push(seed);
    } else {
      seeds.push(seed.toBuffer());
    }
  }

  const [publicKey] = PublicKey.findProgramAddressSync(seeds, programId);

  return publicKey;
}

function evmAddressToBytes32PublicKey(address: string) {
  const normalized = assertEvmAddress(
    address,
    "Avalanche CCTP mint recipient must be a valid wallet address."
  );
  const buffer = Buffer.alloc(32);
  Buffer.from(stripHexPrefix(normalized), "hex").copy(buffer, 12);

  return new PublicKey(buffer);
}

function zeroBytes32PublicKey() {
  return new PublicKey(Buffer.alloc(32));
}

function buildDepositForBurnWithHookData(input: {
  amount: bigint;
  destinationDomain: number;
  mintRecipient: PublicKey;
  destinationCaller: PublicKey;
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData: Buffer;
}) {
  return Buffer.concat([
    depositForBurnWithHookDiscriminator,
    u64Le(input.amount),
    u32Le(input.destinationDomain),
    input.mintRecipient.toBuffer(),
    input.destinationCaller.toBuffer(),
    u64Le(input.maxFee),
    u32Le(input.minFinalityThreshold),
    encodeAnchorBytes(input.hookData),
  ]);
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

function getAvalancheOperatorAddress(environment: RuntimeMode) {
  const config = getCctpSettlementConfig(environment);
  const account = privateKeyToAccount(
    normalizePrivateKey(config.avalancheOperatorPrivateKey)
  );

  return account.address;
}

async function burnSourceUsdcForAvalanche(input: {
  environment: RuntimeMode;
  amount: number;
}) {
  const config = getCctpSettlementConfig(input.environment);
  const connection = new Connection(
    assertNonEmpty(config.collectionRpcUrl, "Collection RPC URL is required."),
    "confirmed"
  );
  const collectionKeypair = await parseSolanaCollectionKeypair(
    config.collectionPrivateKey
  );
  const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import(
    "@solana/spl-token"
  );
  const configuredCollectionWallet = config.collectionWallet.trim();

  if (
    configuredCollectionWallet &&
    configuredCollectionWallet !== collectionKeypair.publicKey.toBase58()
  ) {
    throw new HttpError(
      409,
      "Collection wallet must match the configured collection private key."
    );
  }

  const tokenMessengerProgramId = new PublicKey(
    assertNonEmpty(
      config.collectionTokenMessengerProgramId,
      "CCTP collection TokenMessenger program is required."
    )
  );
  const messageTransmitterProgramId = new PublicKey(
    assertNonEmpty(
      config.collectionMessageTransmitterProgramId,
      "CCTP collection MessageTransmitter program is required."
    )
  );
  const collectionAssetMint = new PublicKey(
    assertNonEmpty(config.collectionAssetMint, "CCTP collection asset mint is required.")
  );
  const sourceTokenAccount = await getAssociatedTokenAddress(
    collectionAssetMint,
    collectionKeypair.publicKey
  );
  const operatorAddress = getAvalancheOperatorAddress(input.environment);
  const amount = amountToSourceTokenUnits(input.amount);
  const maxFee = amountToSourceTokenUnits(config.maxFeeUsdc, { allowZero: true });

  if (maxFee >= amount) {
    throw new HttpError(409, "CCTP max fee must be lower than the settlement amount.");
  }

  const messageSentEventData = SolanaKeypair.generate();
  const instruction = new TransactionInstruction({
    programId: tokenMessengerProgramId,
    keys: [
      { pubkey: collectionKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: collectionKeypair.publicKey, isSigner: true, isWritable: true },
      {
        pubkey: findProgramAddress("sender_authority", tokenMessengerProgramId),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
      {
        pubkey: findProgramAddress("denylist_account", tokenMessengerProgramId, [
          collectionKeypair.publicKey,
        ]),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: findProgramAddress(
          "message_transmitter",
          messageTransmitterProgramId
        ),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: findProgramAddress("token_messenger", tokenMessengerProgramId),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: findProgramAddress("remote_token_messenger", tokenMessengerProgramId, [
          config.destinationDomain.toString(),
        ]),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: findProgramAddress("token_minter", tokenMessengerProgramId),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: findProgramAddress("local_token", tokenMessengerProgramId, [
          collectionAssetMint,
        ]),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: collectionAssetMint, isSigner: false, isWritable: true },
      {
        pubkey: messageSentEventData.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: messageTransmitterProgramId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: tokenMessengerProgramId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: findProgramAddress("__event_authority", tokenMessengerProgramId),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: tokenMessengerProgramId, isSigner: false, isWritable: false },
    ],
    data: buildDepositForBurnWithHookData({
      amount,
      destinationDomain: config.destinationDomain,
      mintRecipient: evmAddressToBytes32PublicKey(operatorAddress),
      destinationCaller: zeroBytes32PublicKey(),
      maxFee,
      minFinalityThreshold: config.minFinalityThreshold,
      hookData: Buffer.alloc(0),
    }),
  });
  const transaction = new Transaction().add(instruction);

  return sendAndConfirmTransaction(
    connection,
    transaction,
    [collectionKeypair, messageSentEventData],
    {
      commitment: "confirmed",
    }
  );
}

type CircleAttestationConfig = ReturnType<typeof getCctpSettlementConfig>;

async function fetchCircleAttestationWithDeps(input: {
  config: Pick<
    CircleAttestationConfig,
    | "sourceDomain"
    | "irisApiUrl"
    | "attestationMaxAttempts"
    | "attestationPollIntervalMs"
  >;
  sourceTxHash: string;
  fetcher: typeof fetch;
  sleep: (durationMs: number) => Promise<void>;
}) {
  const url = new URL(
    `/v2/messages/${input.config.sourceDomain}`,
    input.config.irisApiUrl.endsWith("/")
      ? input.config.irisApiUrl
      : `${input.config.irisApiUrl}/`
  );
  url.searchParams.set("transactionHash", input.sourceTxHash);

  for (let attempt = 0; attempt < input.config.attestationMaxAttempts; attempt += 1) {
    const response = await input.fetcher(url);

    if (response.status === 404) {
      await input.sleep(input.config.attestationPollIntervalMs);
      continue;
    }

    if (!response.ok) {
      throw new HttpError(
        502,
        `Circle attestation request failed with status ${response.status}.`
      );
    }

    const data = (await response.json()) as CircleAttestationResponse;
    const completeMessage = data.messages?.find(
      (message) =>
        message.status === "complete" && message.message && message.attestation
    );

    if (completeMessage?.message && completeMessage.attestation) {
      return {
        message: completeMessage.message,
        attestation: completeMessage.attestation,
      };
    }

    await input.sleep(input.config.attestationPollIntervalMs);
  }

  return null;
}

async function fetchCircleAttestation(input: {
  environment: RuntimeMode;
  sourceTxHash: string;
}) {
  const config = getCctpSettlementConfig(input.environment);

  return fetchCircleAttestationWithDeps({
    config,
    sourceTxHash: input.sourceTxHash,
    fetcher: fetch,
    sleep: (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
  });
}

async function receiveUsdcOnAvalanche(input: {
  environment: RuntimeMode;
  message: string;
  attestation: string;
}) {
  const config = getCctpSettlementConfig(input.environment);
  const rpcUrl = assertNonEmpty(config.avalancheRpcUrl, "Avalanche RPC URL is required.");
  const account = privateKeyToAccount(
    normalizePrivateKey(config.avalancheOperatorPrivateKey)
  );
  const chain = createAvalancheChain({
    chainId: config.avalancheChainId,
    rpcUrl,
    environment: input.environment,
  });
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const messageTransmitterAddress = assertEvmAddress(
    config.avalancheCctpMessageTransmitterAddress,
    "Avalanche CCTP message transmitter must be a valid wallet address."
  );
  const receiveHash = await walletClient.writeContract({
    address: messageTransmitterAddress,
    abi: avalancheCctpMessageTransmitterAbi,
    functionName: "receiveMessage",
    args: [
      hexBytes(input.message, "Circle CCTP message must be hex encoded."),
      hexBytes(input.attestation, "Circle CCTP attestation must be hex encoded."),
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: receiveHash,
  });

  if (receipt.status !== "success") {
    throw new HttpError(502, "Avalanche CCTP receive transaction reverted.");
  }

  return receiveHash;
}

export async function bridgeUsdcToSettlement(input: CctpBridgeInput) {
  if (input.receiveTxHash) {
    return {
      completed: true,
      sourceTxHash: input.sourceTxHash ?? null,
      receiveTxHash: input.receiveTxHash,
      message: input.message ?? null,
      attestation: input.attestation ?? null,
      attested: Boolean(input.message && input.attestation),
    };
  }

  if (!input.sourceTxHash) {
    const sourceTxHash = await burnSourceUsdcForAvalanche({
      environment: input.environment,
      amount: input.amount,
    });

    return {
      completed: false,
      sourceTxHash,
      receiveTxHash: null,
      message: null,
      attestation: null,
      attested: false,
    };
  }

  const attestation =
    input.message && input.attestation
      ? { message: input.message, attestation: input.attestation }
      : await fetchCircleAttestation({
          environment: input.environment,
          sourceTxHash: input.sourceTxHash,
        });

  if (!attestation) {
    return {
      completed: false,
      sourceTxHash: input.sourceTxHash,
      receiveTxHash: null,
      message: input.message ?? null,
      attestation: input.attestation ?? null,
      attested: false,
    };
  }

  const receiveTxHash = await receiveUsdcOnAvalanche({
    environment: input.environment,
    message: attestation.message,
    attestation: attestation.attestation,
  });

  return {
    completed: true,
    sourceTxHash: input.sourceTxHash,
    receiveTxHash,
    message: attestation.message,
    attestation: attestation.attestation,
    attested: true,
  };
}

export const __test__ = {
  amountToSourceTokenUnits,
  buildDepositForBurnWithHookData,
  evmAddressToBytes32PublicKey,
  fetchCircleAttestationWithDeps,
  hexBytes,
};
