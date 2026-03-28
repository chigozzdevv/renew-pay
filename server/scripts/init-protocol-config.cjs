const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const anchor = require("@coral-xyz/anchor");
const { Program, AnchorProvider, web3, BN } = anchor;
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = web3;
const {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} = require("@solana/spl-token");
const bs58Module = require("bs58");

const bs58 = bs58Module.default || bs58Module;

const DEFAULT_PROTOCOL_FEE_BPS = 250;
const DEFAULT_PAYOUT_DELAY_SECONDS = 24 * 60 * 60;
const MIN_ADMIN_FUNDING_LAMPORTS = 1_000_000_000;

function parseKeypairSecret(secret, label) {
  const normalized = (secret || "").trim();

  if (!normalized) {
    throw new Error(`${label} is not configured.`);
  }

  if (normalized.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(normalized)));
  }

  return Keypair.fromSecretKey(bs58.decode(normalized));
}

function getModeConfig(mode) {
  const isLive = mode === "live";

  return {
    mode,
    rpcUrl: isLive ? process.env.SOLANA_RPC_URL_LIVE : process.env.SOLANA_RPC_URL_TEST,
    programId: isLive
      ? process.env.RENEW_PROGRAM_ID_LIVE
      : process.env.RENEW_PROGRAM_ID_TEST,
    settlementMint: isLive
      ? process.env.RENEW_SETTLEMENT_MINT_LIVE
      : process.env.RENEW_SETTLEMENT_MINT_TEST,
    adminSecret: isLive
      ? process.env.SOLANA_ADMIN_SECRET_KEY_LIVE
      : process.env.SOLANA_ADMIN_SECRET_KEY_TEST,
    settlementSecret: isLive
      ? process.env.SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_LIVE
      : process.env.SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_TEST,
  };
}

function readProgramIdl() {
  const idlPath = path.resolve(__dirname, "../../contracts/target/idl/renew_protocol.json");
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

function findPda(seed, programId) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], programId)[0];
}

async function maybeFundAdmin(connection, admin, mode) {
  const deployerPath = path.resolve(__dirname, "../../contracts/keys/renew-devnet-deployer.json");

  if (mode !== "test" || !fs.existsSync(deployerPath)) {
    return;
  }

  const adminBalance = await connection.getBalance(admin.publicKey);

  if (adminBalance >= MIN_ADMIN_FUNDING_LAMPORTS) {
    return;
  }

  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(deployerPath, "utf8")))
  );
  const deployerBalance = await connection.getBalance(deployer.publicKey);
  const transferLamports = MIN_ADMIN_FUNDING_LAMPORTS - adminBalance;

  if (deployerBalance < transferLamports) {
    throw new Error(
      `Deployer wallet ${deployer.publicKey.toBase58()} does not have enough SOL to fund admin.`
    );
  }

  const transferIx = SystemProgram.transfer({
    fromPubkey: deployer.publicKey,
    toPubkey: admin.publicKey,
    lamports: transferLamports,
  });

  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(transferIx),
    [deployer],
    { commitment: "confirmed" }
  );
}

async function ensureFeeCollectorAta(connection, admin, settlementMint) {
  const feeCollectorAta = getAssociatedTokenAddressSync(settlementMint, admin.publicKey);

  try {
    await getAccount(connection, feeCollectorAta, "confirmed");
    return { address: feeCollectorAta, createInstruction: null };
  } catch {
    return {
      address: feeCollectorAta,
      createInstruction: createAssociatedTokenAccountInstruction(
        admin.publicKey,
        feeCollectorAta,
        admin.publicKey,
        settlementMint
      ),
    };
  }
}

async function main() {
  const mode = process.argv[2] === "live" ? "live" : "test";
  const config = getModeConfig(mode);

  if (!config.rpcUrl || !config.programId || !config.settlementMint) {
    throw new Error(`Missing protocol runtime config for ${mode}.`);
  }

  const admin = parseKeypairSecret(config.adminSecret, "Solana admin key");
  const settlementAuthority = parseKeypairSecret(
    config.settlementSecret,
    "Solana settlement authority key"
  );
  const connection = new Connection(config.rpcUrl, "confirmed");

  await maybeFundAdmin(connection, admin, mode);

  const programId = new PublicKey(config.programId);
  const settlementMint = new PublicKey(config.settlementMint);
  const configPda = findPda("config", programId);
  const vaultAuthority = findPda("vault-authority", programId);
  const feeVault = findPda("fee-vault", programId);
  const existingConfig = await connection.getAccountInfo(configPda, "confirmed");

  if (existingConfig) {
    console.log(
      JSON.stringify(
        {
          mode,
          programId: programId.toBase58(),
          configPda: configPda.toBase58(),
          admin: admin.publicKey.toBase58(),
          settlementAuthority: settlementAuthority.publicKey.toBase58(),
          status: "already_initialized",
        },
        null,
        2
      )
    );
    return;
  }

  const wallet = {
    publicKey: admin.publicKey,
    payer: admin,
    async signTransaction(tx) {
      tx.partialSign(admin);
      return tx;
    },
    async signAllTransactions(txs) {
      txs.forEach((tx) => tx.partialSign(admin));
      return txs;
    },
  };

  const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
  const program = new Program(readProgramIdl(), provider);
  const { address: feeCollectorTokenAccount, createInstruction } = await ensureFeeCollectorAta(
    connection,
    admin,
    settlementMint
  );

  const tx = new Transaction();

  if (createInstruction) {
    tx.add(createInstruction);
  }

  const initIx = await program.methods
    .initializeConfig(
      settlementAuthority.publicKey,
      DEFAULT_PROTOCOL_FEE_BPS,
      new BN(DEFAULT_PAYOUT_DELAY_SECONDS)
    )
    .accounts({
      admin: admin.publicKey,
      settlementMint,
      feeCollectorTokenAccount,
      config: configPda,
      vaultAuthority,
      feeVault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  tx.add(initIx);

  const signature = await sendAndConfirmTransaction(connection, tx, [admin], {
    commitment: "confirmed",
  });

  const onchainConfig = await program.account.config.fetch(configPda);

  console.log(
    JSON.stringify(
      {
        mode,
        signature,
        programId: programId.toBase58(),
        configPda: configPda.toBase58(),
        admin: onchainConfig.admin.toBase58(),
        settlementAuthority: onchainConfig.settlementAuthority.toBase58(),
        settlementMint: onchainConfig.settlementMint.toBase58(),
        feeVault: onchainConfig.feeVault.toBase58(),
        feeCollectorTokenAccount: onchainConfig.feeCollectorTokenAccount.toBase58(),
        protocolFeeBps: onchainConfig.protocolFeeBps,
        payoutChangeDelaySeconds: Number(onchainConfig.payoutChangeDelaySeconds),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
