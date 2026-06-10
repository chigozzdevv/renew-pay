import type { Request, Response } from "express";

import { createDemoCollection } from "@/features/demo/demo.service";
import { createDemoCollectionSchema } from "@/features/demo/demo.validation";
import { asyncHandler } from "@/shared/utils/async-handler";

export const createDemoCollectionController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createDemoCollectionSchema.parse(request.body);
    const collection = await createDemoCollection(input);

    response.status(201).json({
      success: true,
      message: "Demo collection created.",
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
