import { env } from "@/config/env.config";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export function getKoraConfig(mode: RuntimeMode = env.PAYMENT_ENV) {
  const isLive = mode === "live";

  return {
    mode,
    rpcUrl: (isLive ? env.KORA_RPC_URL_LIVE : env.KORA_RPC_URL_TEST).trim(),
    apiKey: (isLive ? env.KORA_API_KEY_LIVE : env.KORA_API_KEY_TEST).trim(),
    hmacSecret: (
      isLive ? env.KORA_HMAC_SECRET_LIVE : env.KORA_HMAC_SECRET_TEST
    ).trim(),
    feeTokenMint: (
      isLive ? env.KORA_FEE_TOKEN_MINT_LIVE : env.KORA_FEE_TOKEN_MINT_TEST
    ).trim(),
    enabled: Boolean(
      (isLive ? env.KORA_RPC_URL_LIVE : env.KORA_RPC_URL_TEST).trim()
    ),
  };
}

export type KoraRuntimeConfig = ReturnType<typeof getKoraConfig>;
