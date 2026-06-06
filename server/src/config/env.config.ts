import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const booleanEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean" ? value : value.trim().toLowerCase() !== "false"
  );

function publicStringDefault(value: string) {
  return z.preprocess(
    (input) => {
      if (typeof input !== "string") {
        return value;
      }

      return input.trim() || value;
    },
    z.string().trim().min(1)
  );
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().trim().min(1).default("mongodb://127.0.0.1:27017"),
    MONGODB_DB_NAME: z.string().trim().min(1).default("renew_v2"),
    CORS_ORIGINS: z.string().trim().default("http://localhost:3000"),
    PAYMENT_ENV: z.enum(["test", "live"]).default("test"),
    COLLECTION_WALLET_TEST: z.string().trim().default(""),
    COLLECTION_WALLET_LIVE: z.string().trim().default(""),
    COLLECTION_PRIVATE_KEY_TEST: z.string().trim().default(""),
    COLLECTION_PRIVATE_KEY_LIVE: z.string().trim().default(""),
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
    SOLANA_RPC_SUBSCRIPTIONS_URL_TEST: z
      .string()
      .trim()
      .min(1)
      .default("wss://api.devnet.solana.com"),
    SOLANA_RPC_SUBSCRIPTIONS_URL_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("wss://api.mainnet-beta.solana.com"),
    STELLAR_RPC_URL_TEST: publicStringDefault("https://soroban-testnet.stellar.org"),
    STELLAR_RPC_URL_LIVE: publicStringDefault("https://mainnet.sorobanrpc.com"),
    STELLAR_HORIZON_URL_TEST: publicStringDefault(
      "https://horizon-testnet.stellar.org"
    ),
    STELLAR_HORIZON_URL_LIVE: publicStringDefault("https://horizon.stellar.org"),
    STELLAR_USDC_ASSET_CODE_TEST: publicStringDefault("USDC"),
    STELLAR_USDC_ASSET_CODE_LIVE: publicStringDefault("USDC"),
    STELLAR_USDC_ASSET_ISSUER_TEST: publicStringDefault(
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    ),
    STELLAR_USDC_ASSET_ISSUER_LIVE: publicStringDefault(
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    ),
    STELLAR_USDC_CONTRACT_ID_TEST: publicStringDefault(
      "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
    ),
    STELLAR_USDC_CONTRACT_ID_LIVE: publicStringDefault(
      "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
    ),
    STELLAR_SETTLEMENT_VAULT_CONTRACT_ID_TEST: z.string().trim().default(""),
    STELLAR_SETTLEMENT_VAULT_CONTRACT_ID_LIVE: z.string().trim().default(""),
    STELLAR_SETTLEMENT_OPERATOR_SECRET_TEST: z.string().trim().default(""),
    STELLAR_SETTLEMENT_OPERATOR_SECRET_LIVE: z.string().trim().default(""),
    STELLAR_CCTP_FORWARDER_CONTRACT_ID_TEST: z
      .string()
      .trim()
      .default("CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ"),
    STELLAR_CCTP_FORWARDER_CONTRACT_ID_LIVE: z
      .string()
      .trim()
      .default("CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T"),
    CCTP_SOURCE_DOMAIN_TEST: z.coerce.number().int().nonnegative().default(5),
    CCTP_SOURCE_DOMAIN_LIVE: z.coerce.number().int().nonnegative().default(5),
    CCTP_DESTINATION_DOMAIN_TEST: z.coerce.number().int().nonnegative().default(27),
    CCTP_DESTINATION_DOMAIN_LIVE: z.coerce.number().int().nonnegative().default(27),
    CCTP_SOLANA_USDC_MINT_TEST: z
      .string()
      .trim()
      .default("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
    CCTP_SOLANA_USDC_MINT_LIVE: z
      .string()
      .trim()
      .default("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    CCTP_SOLANA_TOKEN_MESSENGER_PROGRAM_ID_TEST: z
      .string()
      .trim()
      .default("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe"),
    CCTP_SOLANA_TOKEN_MESSENGER_PROGRAM_ID_LIVE: z
      .string()
      .trim()
      .default("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe"),
    CCTP_SOLANA_MESSAGE_TRANSMITTER_PROGRAM_ID_TEST: z
      .string()
      .trim()
      .default("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"),
    CCTP_SOLANA_MESSAGE_TRANSMITTER_PROGRAM_ID_LIVE: z
      .string()
      .trim()
      .default("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"),
    CCTP_MIN_FINALITY_THRESHOLD_TEST: z.coerce.number().int().positive().default(2000),
    CCTP_MIN_FINALITY_THRESHOLD_LIVE: z.coerce.number().int().positive().default(2000),
    CCTP_MAX_FEE_USDC_TEST: z.coerce.number().nonnegative().default(0),
    CCTP_MAX_FEE_USDC_LIVE: z.coerce.number().nonnegative().default(0),
    CCTP_ATTESTATION_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5000),
    CCTP_ATTESTATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(6),
    CIRCLE_IRIS_API_URL_TEST: z
      .string()
      .trim()
      .min(1)
      .default("https://iris-api-sandbox.circle.com"),
    CIRCLE_IRIS_API_URL_LIVE: z
      .string()
      .trim()
      .min(1)
      .default("https://iris-api.circle.com"),
    ENABLE_WORKERS: booleanEnv.default(true),
    REDIS_URL: z.string().trim().min(1).default("redis://127.0.0.1:6379"),
    REDIS_QUEUE_PREFIX: z.string().trim().min(1).default("renew"),
    REDIS_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
    PARTNA_V4_BASE_URL_TEST: z
      .string()
      .trim()
      .default("https://staging-api.getpartna.com/v4"),
    PARTNA_API_KEY_TEST: z.string().trim().default(""),
    PARTNA_API_USER_TEST: z.string().trim().default(""),
    PARTNA_WEBHOOK_PUBLIC_KEY_TEST: z.string().trim().default(""),
    PARTNA_V4_BASE_URL_LIVE: z.string().trim().default(""),
    PARTNA_API_KEY_LIVE: z.string().trim().default(""),
    PARTNA_API_USER_LIVE: z.string().trim().default(""),
    PARTNA_WEBHOOK_PUBLIC_KEY_LIVE: z.string().trim().default(""),
    PARTNA_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    CLOUDINARY_CLOUD_NAME: z.string().trim().default(""),
    CLOUDINARY_API_KEY: z.string().trim().default(""),
    CLOUDINARY_API_SECRET: z.string().trim().default(""),
    CLOUDINARY_UPLOAD_FOLDER: z.string().trim().default("renew"),
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
