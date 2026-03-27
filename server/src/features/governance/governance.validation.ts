import { z } from "zod";

import { environmentInputSchema } from "@/shared/utils/runtime-environment";

export const governanceQuerySchema = z.object({
  environment: environmentInputSchema.default("test"),
});

export const enableGovernanceSchema = z.object({
  environment: environmentInputSchema.default("test"),
  enabled: z.boolean().default(true),
});

export type GovernanceQuery = z.infer<typeof governanceQuerySchema>;
export type EnableGovernanceInput = z.infer<typeof enableGovernanceSchema>;
