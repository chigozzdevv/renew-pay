import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";

import { DeveloperKeyModel } from "@/features/developers/developer-key.model";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { HttpError } from "@/shared/errors/http-error";
import { getPublicApiHostForRuntimeMode, resolveRequestPublicApiRuntimeMode } from "@/shared/utils/public-api-host";

function getDeveloperKeyToken(request: Request) {
  const explicitHeader = request.header("x-renew-secret-key");

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
  return normalized.startsWith("rw_") || normalized.startsWith("rk_")
    ? normalized
    : null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requireDeveloperKeyAuth(
  request: Request,
  _response: Response,
  next: NextFunction
) {
  try {
    const token = getDeveloperKeyToken(request);

    if (!token) {
      throw new HttpError(401, "Missing Renew server key.");
    }

    const tokenHash = hashSecret(token);
    const key = await DeveloperKeyModel.findOne({
      tokenHash,
      status: "active",
    }).exec();

    if (!key) {
      throw new HttpError(401, "Invalid Renew server key.");
    }

    const merchant = await MerchantModel.findById(key.merchantId)
      .select({ _id: 1, status: 1 })
      .lean()
      .exec();

    if (!merchant) {
      throw new HttpError(404, "Merchant was not found for this server key.");
    }

    if (merchant.status !== "active") {
      throw new HttpError(409, "Merchant is not active.");
    }

    const keyEnvironment = key.environment === "live" ? "live" : "test";
    const requestedEnvironment = resolveRequestPublicApiRuntimeMode(request);

    if (requestedEnvironment && requestedEnvironment !== keyEnvironment) {
      throw new HttpError(
        403,
        `This Renew server key must be used with https://${getPublicApiHostForRuntimeMode(keyEnvironment)}.`
      );
    }

    key.lastUsedAt = new Date();
    await key.save();

    request.developerAuth = {
      developerKeyId: key._id.toString(),
      merchantId: key.merchantId.toString(),
      environment: keyEnvironment,
      label: key.label,
    };

    next();
  } catch (error) {
    next(error);
  }
}
