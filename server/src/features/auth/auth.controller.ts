import type { Request, Response } from "express";

import { exchangePrivySession } from "@/features/auth/auth.service";
import { privySessionSchema } from "@/features/auth/auth.validation";
import { asyncHandler } from "@/shared/utils/async-handler";

export const privySessionController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = privySessionSchema.parse(request.body);
    const session = await exchangePrivySession(input);

    response.status(200).json({
      success: true,
      message: "Authenticated with Privy.",
      data: session,
    });
  }
);

export const getCurrentSessionController = asyncHandler(
  async (request: Request, response: Response) => {
    response.status(200).json({
      success: true,
      data: request.platformAuthUser ?? null,
    });
  }
);
