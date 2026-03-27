import type { Request, Response } from "express";

import {
  exchangePrivySession,
} from "@/features/auth/auth.service";
import {
  privySessionSchema,
} from "@/features/auth/auth.validation";
import { HttpError } from "@/shared/errors/http-error";
import { asyncHandler } from "@/shared/utils/async-handler";

export const signupController = asyncHandler(
  async (_request: Request, _response: Response) => {
    throw new HttpError(
      410,
      "Password-based signup has been removed. Create the workspace with Privy instead."
    );
  }
);

export const loginController = asyncHandler(
  async (_request: Request, _response: Response) => {
    throw new HttpError(
      410,
      "Password-based login has been removed. Continue with Privy instead."
    );
  }
);

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

export const activateInviteController = asyncHandler(
  async (_request: Request, _response: Response) => {
    throw new HttpError(
      410,
      "Password-based invite activation has been removed. Sign in with Privy using the invited email instead."
    );
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
