import { getStellarSettlementConfig } from "@/features/settlement/providers/stellar/config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { isStellarAddress } from "@/shared/constants/stellar";
import { HttpError } from "@/shared/errors/http-error";

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
  environment: RuntimeMode;
  address: string;
  funded: boolean;
  trusted: boolean;
  assetCode: string;
  assetIssuer: string;
  balance: string | null;
  limit: string | null;
};

function buildAccountUrl(horizonUrl: string, address: string) {
  const base = horizonUrl.endsWith("/") ? horizonUrl : `${horizonUrl}/`;
  return new URL(`accounts/${address}`, base);
}

function findUsdcBalance(
  account: HorizonAccountResponse,
  assetCode: string,
  assetIssuer: string
) {
  return account.balances?.find(
    (balance) =>
      balance.asset_code === assetCode &&
      balance.asset_issuer === assetIssuer &&
      (balance.asset_type === "credit_alphanum4" ||
        balance.asset_type === "credit_alphanum12")
  );
}

export async function checkStellarUsdcTrustline(input: {
  environment: RuntimeMode;
  address: string;
}): Promise<StellarUsdcTrustlineStatus> {
  const address = input.address.trim().toUpperCase();
  const config = getStellarSettlementConfig(input.environment);
  const assetCode = config.usdcAssetCode.trim().toUpperCase();
  const assetIssuer = config.usdcAssetIssuer.trim().toUpperCase();

  if (!isStellarAddress(address)) {
    throw new HttpError(400, "Payout wallet must be a valid Stellar address.");
  }

  if (!address.startsWith("G")) {
    throw new HttpError(
      400,
      "Payout wallet must be a Stellar account address."
    );
  }

  if (!assetCode || !assetIssuer) {
    throw new HttpError(409, "Stellar USDC asset config is required.");
  }

  const response = await fetch(buildAccountUrl(config.horizonUrl, address));

  if (response.status === 404) {
    return {
      environment: input.environment,
      address,
      funded: false,
      trusted: false,
      assetCode,
      assetIssuer,
      balance: null,
      limit: null,
    };
  }

  if (!response.ok) {
    throw new HttpError(
      502,
      `Stellar trustline check failed with status ${response.status}.`
    );
  }

  const account = (await response.json()) as HorizonAccountResponse;
  const usdcBalance = findUsdcBalance(account, assetCode, assetIssuer);
  const trusted = Boolean(usdcBalance && usdcBalance.is_authorized !== false);

  return {
    environment: input.environment,
    address,
    funded: true,
    trusted,
    assetCode,
    assetIssuer,
    balance: usdcBalance?.balance ?? null,
    limit: usdcBalance?.limit ?? null,
  };
}

export async function assertStellarUsdcTrustline(input: {
  environment: RuntimeMode;
  address: string;
  ownerLabel?: string;
}) {
  const status = await checkStellarUsdcTrustline(input);
  const owner = input.ownerLabel ?? "Payout wallet";

  if (!status.funded) {
    throw new HttpError(
      409,
      `${owner} must be funded with XLM before it can receive Stellar USDC.`
    );
  }

  if (!status.trusted) {
    throw new HttpError(
      409,
      `${owner} must trust Stellar USDC before settlement can be activated.`
    );
  }

  return status;
}
