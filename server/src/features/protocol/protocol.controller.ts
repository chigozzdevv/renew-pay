import type { Request, Response } from "express";

import { getProtocolStatus } from "@/features/protocol/protocol.service";
import { asyncHandler } from "@/shared/utils/async-handler";

export const getProtocolStatusController = asyncHandler(
  async (_request: Request, response: Response) => {
    response.status(200).json({
      success: true,
      data: getProtocolStatus(),
    });
  }
);
