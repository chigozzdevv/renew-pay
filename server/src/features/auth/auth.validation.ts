import { z } from "zod";

import { isSolanaAddress } from "@/shared/constants/solana";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");
const addressSchema = z
  .string()
  .trim()
  .refine(isSolanaAddress, "Must be a valid Solana address.");

export const privySessionSchema = z.object({
  authToken: z.string().trim().min(20),
  identityToken: z.string().trim().min(20).optional(),
  email: z.email().trim().toLowerCase().optional(),
  operatorWalletAddress: addressSchema.optional(),
});

export const authTokenPayloadSchema = z.object({
  sub: objectIdSchema,
  merchantId: objectIdSchema,
});

export type PrivySessionInput = z.infer<typeof privySessionSchema>;
export type AuthTokenPayload = z.infer<typeof authTokenPayloadSchema>;
