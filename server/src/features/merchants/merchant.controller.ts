import type { Request, Response } from "express";

import {
  createMerchant,
  getMerchantById,
  listMerchants,
  updateMerchant,
} from "@/features/merchants/merchant.service";
import {
  createMerchantSchema,
  listMerchantsQuerySchema,
  updateMerchantSchema,
} from "@/features/merchants/merchant.validation";
import { asyncHandler } from "@/shared/utils/async-handler";

export const createMerchantController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createMerchantSchema.parse(request.body);
    const merchant = await createMerchant(input);

    response.status(201).json({
      success: true,
      message: "Merchant created.",
      data: merchant,
    });
  }
);

export const listMerchantsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listMerchantsQuerySchema.parse(request.query);
    const merchants = await listMerchants(query);

    response.status(200).json({
      success: true,
      data: merchants,
    });
  }
);

export const getMerchantController = asyncHandler(
  async (request: Request, response: Response) => {
    const merchant = await getMerchantById(String(request.params.merchantId));

    response.status(200).json({
      success: true,
      data: merchant,
    });
  }
);

export const updateMerchantController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = updateMerchantSchema.parse(request.body);
    const merchant = await updateMerchant(
      String(request.params.merchantId),
      input
    );

    response.status(200).json({
      success: true,
      message: "Merchant updated.",
      data: merchant,
    });
  }
);
