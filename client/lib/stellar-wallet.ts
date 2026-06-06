type StellarWalletMode = "test" | "live";

const stellarConfigByMode = {
  test: {
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    usdcIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
  live: {
    horizonUrl: "https://horizon.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  },
} satisfies Record<StellarWalletMode, {
  horizonUrl: string;
  networkPassphrase: string;
  usdcIssuer: string;
}>;

async function loadStellarWalletKit(mode: StellarWalletMode) {
  const [{ Networks, StellarWalletsKit }, { defaultModules }] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit"),
    import("@creit.tech/stellar-wallets-kit/modules/utils"),
  ]);

  StellarWalletsKit.init({
    modules: defaultModules(),
    network: mode === "live" ? Networks.PUBLIC : Networks.TESTNET,
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: true,
    },
  });

  return StellarWalletsKit;
}

export async function connectStellarWallet(mode: StellarWalletMode) {
  const StellarWalletsKit = await loadStellarWalletKit(mode);
  const { address } = await StellarWalletsKit.authModal();

  return address;
}

export async function enableStellarUsdcTrustline(
  mode: StellarWalletMode,
  address: string
) {
  const normalizedAddress = address.trim().toUpperCase();

  if (!normalizedAddress) {
    throw new Error("Connect a settlement wallet first.");
  }

  const [StellarWalletsKit, stellarSdk] = await Promise.all([
    loadStellarWalletKit(mode),
    import("@stellar/stellar-sdk"),
  ]);
  const config = stellarConfigByMode[mode];
  const server = new stellarSdk.Horizon.Server(config.horizonUrl);
  const account = await server.loadAccount(normalizedAddress);
  const usdc = new stellarSdk.Asset("USDC", config.usdcIssuer);
  const transaction = new stellarSdk.TransactionBuilder(account, {
    fee: stellarSdk.BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(stellarSdk.Operation.changeTrust({ asset: usdc }))
    .setTimeout(60)
    .build();
  const { signedTxXdr, signerAddress } = await StellarWalletsKit.signTransaction(
    transaction.toXDR(),
    {
      networkPassphrase: config.networkPassphrase,
      address: normalizedAddress,
    }
  );
  if (
    signerAddress &&
    signerAddress.trim().toUpperCase() !== normalizedAddress
  ) {
    throw new Error("Selected wallet does not match the settlement wallet.");
  }
  const signedTransaction = stellarSdk.TransactionBuilder.fromXDR(
    signedTxXdr,
    config.networkPassphrase
  );
  const submittedTransaction = await server.submitTransaction(signedTransaction);

  return {
    txHash: submittedTransaction.hash,
  };
}
