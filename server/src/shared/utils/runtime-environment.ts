import { z } from "zod";

import type { RuntimeMode } from "@/shared/constants/runtime-mode";

export const environmentInputSchema = z
  .enum(["sandbox", "test", "live"])
  .transform<RuntimeMode>((value) => (value === "live" ? "live" : "test"));

export const optionalEnvironmentInputSchema = environmentInputSchema.optional();

export function toStoredRuntimeMode(value: unknown): RuntimeMode {
  return value === "live" ? "live" : "test";
}

export function toPublicEnvironment(mode: RuntimeMode) {
  return mode === "live" ? "live" : "sandbox";
}

export function matchesRuntimeMode(value: unknown, mode: RuntimeMode) {
  return mode === "live" ? value === "live" : value !== "live";
}

export function createRuntimeModeCondition(field: string, mode: RuntimeMode) {
  if (mode === "live") {
    return {
      [field]: "live",
    };
  }

  return {
    $or: [
      {
        [field]: "test",
      },
      {
        [field]: {
          $exists: false,
        },
      },
    ],
  };
}
