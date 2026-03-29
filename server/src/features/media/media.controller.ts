import type { Request, Response } from "express";

import { createMerchantLogoUploadSignature } from "@/features/media/media.service";
import { HttpError } from "@/shared/errors/http-error";
import { asyncHandler } from "@/shared/utils/async-handler";

export const createMerchantLogoUploadSignatureController = asyncHandler(
  async (request: Request, response: Response) => {
    const merchantId = request.platformAuthUser?.merchantId;

    if (!merchantId) {
      throw new HttpError(401, "Authentication is required.");
    }

    const payload = createMerchantLogoUploadSignature({ merchantId });

    response.status(200).json({
      success: true,
      data: payload,
    });
  }
);
