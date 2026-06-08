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

type HorizonBalanceLine = {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
  limit?: string;
  is_authorized?: boolean;
};

type HorizonAccountResponse = {
  balances?: HorizonBalanceLine[];
};

export type StellarUsdcTrustlineStatus = {
  address: string;
  funded: boolean;
  trusted: boolean;
  balance: string | null;
  limit: string | null;
};

function buildAccountUrl(horizonUrl: string, address: string) {
  const base = horizonUrl.endsWith("/") ? horizonUrl : `${horizonUrl}/`;

  return new URL(`accounts/${address}`, base);
}

function findUsdcBalance(account: HorizonAccountResponse, issuer: string) {
  return account.balances?.find(
    (balance) =>
      balance.asset_code === "USDC" &&
      balance.asset_issuer === issuer &&
      (balance.asset_type === "credit_alphanum4" ||
        balance.asset_type === "credit_alphanum12")
  );
}

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

export async function checkStellarUsdcTrustline(
  mode: StellarWalletMode,
  address: string
): Promise<StellarUsdcTrustlineStatus> {
  const normalizedAddress = address.trim().toUpperCase();

  if (!normalizedAddress) {
    throw new Error("Connect a settlement wallet first.");
  }

  const config = stellarConfigByMode[mode];
  const response = await fetch(buildAccountUrl(config.horizonUrl, normalizedAddress));

  if (response.status === 404) {
    return {
      address: normalizedAddress,
      funded: false,
      trusted: false,
      balance: null,
      limit: null,
    };
  }

  if (!response.ok) {
    throw new Error("Could not check USDC status.");
  }

  const account = (await response.json()) as HorizonAccountResponse;
  const usdcBalance = findUsdcBalance(account, config.usdcIssuer);

  return {
    address: normalizedAddress,
    funded: true,
    trusted: Boolean(usdcBalance && usdcBalance.is_authorized !== false),
    balance: usdcBalance?.balance ?? null,
    limit: usdcBalance?.limit ?? null,
  };
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
