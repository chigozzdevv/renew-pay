import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const booleanEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean" ? value : value.trim().toLowerCase() !== "false"
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().trim().min(1).default("mongodb://127.0.0.1:27017"),
    MONGODB_DB_NAME: z.string().trim().min(1).default("renew_v2"),
    CORS_ORIGINS: z.string().trim().default("http://localhost:3000"),
    PAYMENT_ENV: z.enum(["test", "live"]).default("test"),
    PAYMENT_RAIL_PROVIDER_TEST: z.enum(["yellow_card", "partna"]).default("partna"),
    PAYMENT_RAIL_PROVIDER_LIVE: z.enum(["yellow_card", "partna"]).default("partna"),
    SOLANA_CLUSTER_TEST: z
      .string()
      .trim()
      .min(1)
      .default("devnet"),
    SOLANA_CLUSTER_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("mainnet-beta"),
    SOLANA_RPC_URL_TEST: z
      .string()
      .trim()
      .min(1)
      .default("https://api.devnet.solana.com"),
    SOLANA_RPC_URL_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("https://api.mainnet-beta.solana.com"),
    SOLANA_WS_URL_TEST: z
      .string()
      .trim()
      .min(1)
      .default("wss://api.devnet.solana.com"),
    SOLANA_WS_URL_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("wss://api.mainnet-beta.solana.com"),
    RENEW_PROGRAM_ID_TEST: z
      .string()
      .trim()
      .min(1)
      .default("fScJ66UUXwsb4ogdFgYSZfEG7piyhTi4z9gZZe931oh"),
    RENEW_PROGRAM_ID_LIVE: z.string().trim().default(""),
    RENEW_SETTLEMENT_MINT_TEST: z.string().trim().default(""),
    RENEW_SETTLEMENT_MINT_LIVE: z.string().trim().default(""),
    SOLANA_EXPLORER_BASE_URL_TEST: z
      .string()
      .trim()
      .min(1)
      .default("https://explorer.solana.com"),
    SOLANA_EXPLORER_BASE_URL_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("https://explorer.solana.com"),
    SOLANA_ADMIN_SECRET_KEY_TEST: z.string().trim().default(""),
    SOLANA_ADMIN_SECRET_KEY_LIVE: z.string().trim().default(""),
    SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_TEST: z.string().trim().default(""),
    SOLANA_SETTLEMENT_AUTHORITY_SECRET_KEY_LIVE: z.string().trim().default(""),
    SQUADS_DEFAULT_VAULT_INDEX: z.coerce.number().int().min(0).default(0),
    ENABLE_WORKERS: booleanEnv.default(true),
    REDIS_URL: z.string().trim().min(1).default("redis://127.0.0.1:6379"),
    REDIS_QUEUE_PREFIX: z.string().trim().min(1).default("renew"),
    REDIS_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
    YELLOW_CARD_BASE_URL_TEST: z
      .string()
      .trim()
      .min(1)
      .default("https://sandbox.api.yellowcard.io/business"),
    YELLOW_CARD_BASE_URL_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("https://api.yellowcard.io/business"),
    YELLOW_CARD_API_KEY_TEST: z.string().trim().default(""),
    YELLOW_CARD_API_KEY_LIVE: z.string().trim().default(""),
    YELLOW_CARD_TIMESTAMP_HEADER: z
      .string()
      .trim()
      .min(1)
      .default("X-YC-Timestamp"),
    YELLOW_CARD_WEBHOOK_SECRET_TEST: z.string().trim().default(""),
    YELLOW_CARD_WEBHOOK_SECRET_LIVE: z.string().trim().default(""),
    YELLOW_CARD_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    PARTNA_V4_BASE_URL_TEST: z
      .string()
      .trim()
      .default("https://staging-api.getpartna.com/v4"),
    PARTNA_VOUCHERS_BASE_URL_TEST: z
      .string()
      .trim()
      .default("https://staging-vouchers.ventogram.com/api/v1"),
    PARTNA_API_KEY_TEST: z.string().trim().default(""),
    PARTNA_API_USER_TEST: z.string().trim().default(""),
    PARTNA_WEBHOOK_PUBLIC_KEY_TEST: z.string().trim().default(""),
    PARTNA_V4_BASE_URL_LIVE: z.string().trim().default(""),
    PARTNA_VOUCHERS_BASE_URL_LIVE: z.string().trim().default(""),
    PARTNA_API_KEY_LIVE: z.string().trim().default(""),
    PARTNA_API_USER_LIVE: z.string().trim().default(""),
    PARTNA_WEBHOOK_PUBLIC_KEY_LIVE: z.string().trim().default(""),
    PARTNA_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    SUMSUB_BASE_URL_TEST: z
      .string()
      .trim()
      .min(1)
      .default("https://api.sumsub.com"),
    SUMSUB_APP_TOKEN_TEST: z.string().trim().default(""),
    SUMSUB_SECRET_KEY_TEST: z.string().trim().default(""),
    SUMSUB_LEVEL_NAME_KYC_TEST: z.string().trim().min(1).default("renew-kyc-test"),
    SUMSUB_LEVEL_NAME_KYB_TEST: z.string().trim().min(1).default("renew-kyb-test"),
    SUMSUB_WEBHOOK_SECRET_TEST: z.string().trim().default(""),
    SUMSUB_BASE_URL_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("https://api.sumsub.com"),
    SUMSUB_APP_TOKEN_LIVE: z.string().trim().default(""),
    SUMSUB_SECRET_KEY_LIVE: z.string().trim().default(""),
    SUMSUB_LEVEL_NAME_KYC_LIVE: z.string().trim().min(1).default("renew-kyc-live"),
    SUMSUB_LEVEL_NAME_KYB_LIVE: z.string().trim().min(1).default("renew-kyb-live"),
    SUMSUB_WEBHOOK_SECRET_LIVE: z.string().trim().default(""),
    SUMSUB_SDK_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    SUMSUB_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    DEVELOPER_WEBHOOK_SECRET_ENCRYPTION_KEY: z.string().trim().min(32),
    PLATFORM_AUTH_ENABLED: booleanEnv.default(true),
    PLATFORM_AUTH_JWT_SECRET: z
      .string()
      .trim()
      .min(16)
      .default("renew_dev_jwt_secret_change_before_production"),
    PLATFORM_AUTH_TOKEN_TTL_SECONDS: z
      .coerce
      .number()
      .int()
      .positive()
      .default(8 * 60 * 60),
    PLATFORM_AUTH_PASSWORD_ITERATIONS: z.coerce.number().int().positive().default(310000),
    PRIVY_APP_ID: z.string().trim().default(""),
    PRIVY_APP_SECRET: z.string().trim().default(""),
    API_BASE_URL: z.string().trim().min(1).default("http://localhost:4000"),
    APP_BASE_URL: z.string().trim().min(1).default("http://localhost:3000"),
    RESEND_API_KEY: z.string().trim().default(""),
    RESEND_FROM_EMAIL: z
      .string()
      .trim()
      .default("Renew <notifications@updates.renew.sh>"),
    RESEND_REPLY_TO_EMAIL: z.string().trim().default(""),
    RESEND_WEBHOOK_SECRET: z.string().trim().default(""),
    RESEND_INBOUND_FORWARD_TO: z.string().trim().default(""),
    RESEND_INBOUND_FORWARD_FROM: z.string().trim().default(""),
  });

export const env = envSchema.parse(process.env);

export function getAllowedCorsOrigins() {
  return env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
