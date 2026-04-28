const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const anchor = require("@coral-xyz/anchor");
const { Program, AnchorProvider, web3 } = anchor;
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = web3;
const bs58Module = require("bs58");

const bs58 = bs58Module.default || bs58Module;

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
    adminSecret: isLive
      ? process.env.SOLANA_ADMIN_SECRET_KEY_LIVE
      : process.env.SOLANA_ADMIN_SECRET_KEY_TEST,
    operatorSecret: isLive
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

async function main() {
  const mode = process.argv[2] === "live" ? "live" : "test";
  const config = getModeConfig(mode);

  if (!config.rpcUrl || !config.programId) {
    throw new Error(`Missing protocol runtime config for ${mode}.`);
  }

  const admin = parseKeypairSecret(config.adminSecret, "Solana admin key");
  const operator = parseKeypairSecret(config.operatorSecret, "Solana protocol operator key");
  const connection = new Connection(config.rpcUrl, "confirmed");

  await maybeFundAdmin(connection, admin, mode);

  const programId = new PublicKey(config.programId);
  const configPda = findPda("config", programId);
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
  const existingConfig = await connection.getAccountInfo(configPda, "confirmed");

  if (existingConfig) {
    const configAccount = await program.account.config.fetch(configPda);

    console.log(
      JSON.stringify(
        {
          mode,
          programId: programId.toBase58(),
          configPda: configPda.toBase58(),
          admin: configAccount.admin.toBase58(),
          operator: configAccount.operator.toBase58(),
          pauser: configAccount.pauser.toBase58(),
          paused: configAccount.paused,
          routeCount: Number(configAccount.routeCount),
          commitmentCount: Number(configAccount.commitmentCount),
          status: "already_initialized",
        },
        null,
        2
      )
    );
    return;
  }

  const initIx = await program.methods
    .initializeConfig(operator.publicKey, admin.publicKey)
    .accounts({
      admin: admin.publicKey,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(initIx),
    [admin],
    { commitment: "confirmed" }
  );

  const configAccount = await program.account.config.fetch(configPda);

  console.log(
    JSON.stringify(
      {
        mode,
        signature,
        programId: programId.toBase58(),
        configPda: configPda.toBase58(),
        admin: configAccount.admin.toBase58(),
        operator: configAccount.operator.toBase58(),
        pauser: configAccount.pauser.toBase58(),
        paused: configAccount.paused,
        routeCount: Number(configAccount.routeCount),
        commitmentCount: Number(configAccount.commitmentCount),
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
