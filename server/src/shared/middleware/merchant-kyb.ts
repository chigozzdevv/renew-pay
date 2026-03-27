import type { NextFunction, Request, Response, RequestHandler } from "express";

import { assertMerchantKybApprovedForLive } from "@/features/kyc/kyc.service";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";

function resolveMerchantScope(request: Request) {
  if (request.platformAuthUser?.merchantId) {
    return request.platformAuthUser.merchantId;
  }

  if (typeof request.params.merchantId === "string") {
    return request.params.merchantId.trim();
  }

  if (typeof request.query.merchantId === "string") {
    return request.query.merchantId.trim();
  }

  if (
    typeof request.body === "object" &&
    request.body !== null &&
    "merchantId" in request.body &&
    typeof request.body.merchantId === "string"
  ) {
    return request.body.merchantId.trim();
  }

  return null;
}

export function requireMerchantKybApproved(
  actionDescription = "running this live operation"
): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const merchantId = resolveMerchantScope(request);
      const environment = optionalEnvironmentInputSchema.parse(
        typeof request.query.environment === "string"
          ? request.query.environment
          : request.body?.environment
      );

      if (!merchantId || !environment) {
        next();
        return;
      }

      await assertMerchantKybApprovedForLive(
        merchantId,
        actionDescription,
        environment
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}
