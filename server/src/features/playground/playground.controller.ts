import type { Request, Response } from "express";

import { createPlaygroundCollection } from "@/features/playground/playground.service";
import { createPlaygroundCollectionSchema } from "@/features/playground/playground.validation";
import { asyncHandler } from "@/shared/utils/async-handler";

export const createPlaygroundCollectionController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createPlaygroundCollectionSchema.parse(request.body);
    const collection = await createPlaygroundCollection(input);

    response.status(201).json({
      success: true,
      message: "Playground collection created.",
      data: {
        id: collection.id,
        reference: collection.reference,
        amount: collection.amount,
        currency: collection.currency,
        checkoutUrl: collection.checkoutUrl,
      },
    });
  }
);
