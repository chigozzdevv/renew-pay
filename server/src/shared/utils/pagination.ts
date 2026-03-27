import { z } from "zod";

export const optionalPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type OptionalPaginationQuery = z.infer<typeof optionalPaginationQuerySchema>;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ListResult<T> = {
  items: T[];
  pagination?: PaginationMeta;
};

export function resolvePagination(
  input: OptionalPaginationQuery,
  defaultLimit = 20
) {
  if (input.page === undefined && input.limit === undefined) {
    return null;
  }

  const page = input.page ?? 1;
  const limit = input.limit ?? defaultLimit;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function buildPagination(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
