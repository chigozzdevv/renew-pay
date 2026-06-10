import { randomUUID } from "node:crypto";

import { env } from "@/config/env.config";
import {
  getDemoMarket,
  getDemoUseCase,
  getDemoVariant,
} from "@/features/demo/demo.catalog";
import type { CreateDemoCollectionInput } from "@/features/demo/demo.validation";
import { HttpError } from "@/shared/errors/http-error";

function createReference(useCase: string) {
  const suffix = randomUUID().slice(0, 8);

  return `demo_${useCase}_${suffix}`;
}

export async function createDemoCollection(input: CreateDemoCollectionInput) {
  if (!env.DEMO_RENEW_SECRET_KEY) {
    throw new HttpError(500, "Demo Renew server key is not configured.");
  }

  const useCase = getDemoUseCase(input.useCase);
  const variant = getDemoVariant(useCase, input.variant ?? "");
  const market = getDemoMarket(input.market);
  const items = useCase.items[variant] ?? [];
  const quantities = input.itemIds.reduce<Map<string, number>>((next, itemId) => {
    next.set(itemId, (next.get(itemId) ?? 0) + 1);
    return next;
  }, new Map());
  const lineItems = items
    .filter((item) => quantities.has(item.id))
    .map((item) => ({
      name: item.name,
      quantity: quantities.get(item.id) ?? 1,
      amount: item.amount[market.currency],
    }));
  const amount = lineItems.reduce(
    (sum, item) => sum + item.amount * item.quantity,
    0
  );

  if (lineItems.length === 0 || amount <= 0) {
    throw new HttpError(400, "Choose at least one item.");
  }

  const { renew } = await import("@renew.sh/sdk");
  const client = renew({
    secretKey: env.DEMO_RENEW_SECRET_KEY,
  });

  return client.collections.create({
    amount,
    currency: market.currency,
    reference: createReference(useCase.id),
    description: useCase.title,
    items: lineItems,
    recurring: useCase.recurring ?? { enabled: false },
    metadata: {
      demo: true,
      useCase: useCase.id,
      market: market.code,
      variant,
    },
  });
}
