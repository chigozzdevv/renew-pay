import { env } from "@/config/env.config";

export function getSquadsConfig() {
  return {
    defaultVaultIndex: env.SQUADS_DEFAULT_VAULT_INDEX,
  };
}

export type SquadsRuntimeConfig = ReturnType<typeof getSquadsConfig>;
