import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

function parseKeypairSecret(secret: string, label: string) {
  const normalized = secret.trim();

  if (!normalized) {
    throw new HttpError(503, `${label} is not configured.`);
  }

  try {
    if (normalized.startsWith("[")) {
      const parsed = JSON.parse(normalized) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }

    return Keypair.fromSecretKey(bs58.decode(normalized));
  } catch (error) {
    console.error(`[solana-keypair] invalid ${label}`, error);
    throw new HttpError(
      503,
      `${label} is invalid. Use a base58 secret key or a JSON array secret key.`
    );
  }
}

export function getSolanaAdminKeypair(mode: RuntimeMode) {
  return parseKeypairSecret(
    mode === "live"
      ? env.SOLANA_ADMIN_SECRET_KEY_LIVE
      : env.SOLANA_ADMIN_SECRET_KEY_TEST,
    "Solana admin key"
  );
}

export function getSolanaSettlementAuthorityKeypair(mode: RuntimeMode) {
  return parseKeypairSecret(
    mode === "live"
      ? env.SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_LIVE
      : env.SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_TEST,
    "Solana settlement authority key"
  );
}
