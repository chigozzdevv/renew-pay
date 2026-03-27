import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId.");

const auditCategorySchema = z.enum([
  "workspace",
  "team",
  "billing",
  "security",
  "developer",
  "payments",
  "treasury",
  "protocol",
]);

const auditStatusSchema = z.enum(["ok", "warning", "error"]);

export const createAuditSchema = z.object({
  merchantId: objectIdSchema,
  actor: z.string().trim().min(2).max(120).default("system"),
  action: z.string().trim().min(2).max(160),
  category: auditCategorySchema.default("workspace"),
  status: auditStatusSchema.default("ok"),
  target: z.string().trim().min(1).max(160).nullish().transform((value) => value ?? null),
  detail: z.string().trim().min(2).max(400),
  metadata: z.record(z.string(), z.unknown()).default({}),
  ipAddress: z.string().trim().min(1).max(80).nullish().transform((value) => value ?? null),
  userAgent: z.string().trim().min(1).max(300).nullish().transform((value) => value ?? null),
});

export const listAuditQuerySchema = z.object({
  merchantId: objectIdSchema,
  category: auditCategorySchema.optional(),
  status: auditStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateAuditInput = z.infer<typeof createAuditSchema>;
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
