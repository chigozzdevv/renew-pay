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
  BASE_FEE,
  Contract,
  Keypair as StellarKeypair,
  StrKey,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

import { getCctpSettlementConfig } from "@/features/settlement/providers/cctp/config";
import {
  assertStellarUsdcTrustline,
} from "@/features/settlement/providers/stellar/trustline.service";
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

const cctpHookMagicBytesLength = 24;
const cctpHookVersion = 0;
const solanaUsdcDecimals = 6;

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

  const [whole, fraction = ""] = amount.toFixed(solanaUsdcDecimals).split(".");

  return (
    BigInt(whole) * 10n ** BigInt(solanaUsdcDecimals) +
    BigInt(fraction.padEnd(solanaUsdcDecimals, "0").slice(0, solanaUsdcDecimals))
  );
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

function u32Be(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function encodeAnchorBytes(value: Buffer) {
  return Buffer.concat([u32Le(value.length), value]);
}

function stellarContractToSolanaPublicKey(contractId: string) {
  try {
    return new PublicKey(StrKey.decodeContract(contractId));
  } catch {
    throw new HttpError(409, "Stellar CCTP forwarder contract is invalid.");
  }
}

function createForwarderHookData(forwardRecipient: string) {
  const recipientBytes = Buffer.from(forwardRecipient, "utf8");

  return Buffer.concat([
    Buffer.alloc(cctpHookMagicBytesLength),
    u32Be(cctpHookVersion),
    u32Be(recipientBytes.length),
    recipientBytes,
  ]);
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

function stripHexPrefix(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

async function burnSourceUsdcForStellar(input: {
  environment: RuntimeMode;
  amount: number;
}) {
  const config = getCctpSettlementConfig(input.environment);
  const connection = new Connection(config.solanaRpcUrl, "confirmed");
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
      config.solanaTokenMessengerProgramId,
      "Solana CCTP TokenMessenger program is required."
    )
  );
  const messageTransmitterProgramId = new PublicKey(
    assertNonEmpty(
      config.solanaMessageTransmitterProgramId,
      "Solana CCTP MessageTransmitter program is required."
    )
  );
  const usdcMint = new PublicKey(
    assertNonEmpty(config.solanaUsdcMint, "Solana USDC mint is required.")
  );
  const sourceTokenAccount = await getAssociatedTokenAddress(
    usdcMint,
    collectionKeypair.publicKey
  );
  const stellarOperator = StellarKeypair.fromSecret(
    assertNonEmpty(
      config.stellarOperatorSecret,
      "Stellar settlement operator key is required for CCTP settlement."
    )
  );
  await assertStellarUsdcTrustline({
    environment: input.environment,
    address: stellarOperator.publicKey(),
    ownerLabel: "Stellar settlement operator",
  });
  const forwarderContractId = assertNonEmpty(
    config.stellarCctpForwarderContractId,
    "Stellar CCTP forwarder contract is required."
  );
  const forwarderPublicKey = stellarContractToSolanaPublicKey(forwarderContractId);
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
          usdcMint,
        ]),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: usdcMint, isSigner: false, isWritable: true },
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
      mintRecipient: forwarderPublicKey,
      destinationCaller: forwarderPublicKey,
      maxFee,
      minFinalityThreshold: config.minFinalityThreshold,
      hookData: createForwarderHookData(stellarOperator.publicKey()),
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

async function fetchCircleAttestation(input: {
  environment: RuntimeMode;
  sourceTxHash: string;
}) {
  const config = getCctpSettlementConfig(input.environment);
  const url = new URL(
    `/v2/messages/${config.sourceDomain}`,
    config.irisApiUrl.endsWith("/")
      ? config.irisApiUrl
      : `${config.irisApiUrl}/`
  );
  url.searchParams.set("transactionHash", input.sourceTxHash);

  for (let attempt = 0; attempt < config.attestationMaxAttempts; attempt += 1) {
    const response = await fetch(url);

    if (response.status === 404) {
      await new Promise((resolve) =>
        setTimeout(resolve, config.attestationPollIntervalMs)
      );
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

    await new Promise((resolve) =>
      setTimeout(resolve, config.attestationPollIntervalMs)
    );
  }

  return null;
}

async function mintAndForwardOnStellar(input: {
  environment: RuntimeMode;
  message: string;
  attestation: string;
}) {
  const config = getCctpSettlementConfig(input.environment);
  const server = new rpc.Server(
    assertNonEmpty(config.stellarRpcUrl, "Stellar RPC URL is required.")
  );
  const operatorKeypair = StellarKeypair.fromSecret(
    assertNonEmpty(
      config.stellarOperatorSecret,
      "Stellar settlement operator key is required."
    )
  );
  const operatorAccount = await server.getAccount(operatorKeypair.publicKey());
  const contract = new Contract(
    assertNonEmpty(
      config.stellarCctpForwarderContractId,
      "Stellar CCTP forwarder contract is required."
    )
  );
  const transaction = new TransactionBuilder(operatorAccount, {
    fee: BASE_FEE,
    networkPassphrase: assertNonEmpty(
      config.stellarNetworkPassphrase,
      "Stellar network passphrase is required."
    ),
  })
    .addOperation(
      contract.call(
        "mint_and_forward",
        xdr.ScVal.scvBytes(Buffer.from(stripHexPrefix(input.message), "hex")),
        xdr.ScVal.scvBytes(Buffer.from(stripHexPrefix(input.attestation), "hex"))
      )
    )
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
      `Stellar CCTP receive transaction was not accepted: ${submittedTransaction.status}.`
    );
  }

  const confirmedTransaction = await server.pollTransaction(
    submittedTransaction.hash,
    { attempts: 20 }
  );

  if (confirmedTransaction.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new HttpError(
      502,
      `Stellar CCTP receive transaction did not complete successfully: ${confirmedTransaction.status}.`
    );
  }

  return confirmedTransaction.txHash;
}

export async function bridgeUsdcToStellar(input: CctpBridgeInput) {
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
    const sourceTxHash = await burnSourceUsdcForStellar({
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

  const receiveTxHash = await mintAndForwardOnStellar({
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
