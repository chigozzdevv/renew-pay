import type { NextFunction, Request, Response, RequestHandler } from "express";

import {
  liveOnboardingDisabledMessage,
  liveOnboardingEnabled,
} from "@/shared/constants/live-onboarding";
import { HttpError } from "@/shared/errors/http-error";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";

function resolveEnvironment(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export function blockLiveModeUntilLaunch(): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      const environment = resolveEnvironment(request);

      if (liveOnboardingEnabled || environment !== "live") {
        next();
        return;
      }

      throw new HttpError(409, liveOnboardingDisabledMessage);
    } catch (error) {
      next(error);
    }
  };
}
