import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";

import { CheckoutSessionModel } from "@/features/checkout/checkout-session.model";
import { HttpError } from "@/shared/errors/http-error";
import { getPublicApiHostForRuntimeMode, resolveRequestPublicApiRuntimeMode } from "@/shared/utils/public-api-host";

function getCheckoutClientSecret(request: Request) {
  const explicitHeader = request.header("x-renew-client-secret");

  if (explicitHeader?.trim()) {
    return explicitHeader.trim();
  }

  const authorization = request.header("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const normalized = token.trim();
  return normalized.startsWith("rcs_") ? normalized : null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requireCheckoutSessionAuth(
  request: Request,
  _response: Response,
  next: NextFunction
) {
  try {
    const token = getCheckoutClientSecret(request);

    if (!token) {
      throw new HttpError(401, "Missing Renew checkout client secret.");
    }

    const sessionId = String(request.params.sessionId ?? "").trim();

    if (!sessionId) {
      throw new HttpError(400, "checkout sessionId is required.");
    }

    const tokenHash = hashSecret(token);
    const session = await CheckoutSessionModel.findOne({
      _id: sessionId,
      clientTokenHash: tokenHash,
    })
      .select({ _id: 1, environment: 1, expiresAt: 1 })
      .lean()
      .exec();

    if (!session) {
      throw new HttpError(401, "Invalid Renew checkout client secret.");
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, "Checkout session has expired.");
    }

    const sessionEnvironment = session.environment === "live" ? "live" : "test";
    const requestedEnvironment = resolveRequestPublicApiRuntimeMode(request);

    if (requestedEnvironment && requestedEnvironment !== sessionEnvironment) {
      throw new HttpError(
        403,
        `This checkout session must be used with https://${getPublicApiHostForRuntimeMode(sessionEnvironment)}.`
      );
    }

    request.checkoutSessionAuth = {
      sessionId,
    };

    next();
  } catch (error) {
    next(error);
  }
}
