import type { NextFunction, Request, Response, RequestHandler } from "express";

import { env } from "@/config/env.config";
import { authTokenPayloadSchema } from "@/features/auth/auth.validation";
import { getAuthenticatedUser } from "@/features/auth/auth.service";
import { type TeamPermission, type TeamRole } from "@/shared/constants/team-rbac";
import { HttpError } from "@/shared/errors/http-error";
import { verifyJwt } from "@/shared/utils/jwt";

function getBearerToken(request: Request) {
  const authorization = request.header("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
}

function extractMerchantScopes(request: Request) {
  const scopes = new Set<string>();
  const queryMerchantId = request.query.merchantId;
  const bodyMerchantId =
    typeof request.body === "object" &&
    request.body !== null &&
    "merchantId" in request.body &&
    typeof request.body.merchantId === "string"
      ? request.body.merchantId
      : null;

  if (typeof request.params.merchantId === "string") {
    scopes.add(request.params.merchantId.trim());
  }

  if (typeof queryMerchantId === "string") {
    scopes.add(queryMerchantId.trim());
  }

  if (bodyMerchantId) {
    scopes.add(bodyMerchantId.trim());
  }

  return [...scopes].filter(Boolean);
}

export async function requirePlatformAuth(
  request: Request,
  _response: Response,
  next: NextFunction
) {
  try {
    if (!env.PLATFORM_AUTH_ENABLED) {
      next();
      return;
    }

    const token = getBearerToken(request);

    if (!token) {
      throw new HttpError(401, "Missing bearer token.");
    }

    const jwtPayload = verifyJwt(token, env.PLATFORM_AUTH_JWT_SECRET);
    const payload = authTokenPayloadSchema.parse(jwtPayload);
    const user = await getAuthenticatedUser(payload);

    const scopes = extractMerchantScopes(request);

    if (scopes.some((merchantId) => merchantId !== user.merchantId)) {
      throw new HttpError(403, "Token does not have access to this merchant scope.");
    }

    request.platformAuthUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePlatformPermissions(
  permissions: TeamPermission[]
): RequestHandler {
  return (request, _response, next) => {
    try {
      if (!env.PLATFORM_AUTH_ENABLED) {
        next();
        return;
      }

      const user = request.platformAuthUser;

      if (!user) {
        throw new HttpError(401, "Authentication is required.");
      }

      if (permissions.length === 0) {
        next();
        return;
      }

      const userPermissions = new Set(user.permissions);
      const hasAnyPermission = permissions.some((permission) =>
        userPermissions.has(permission)
      );

      if (!hasAnyPermission) {
        throw new HttpError(403, "Missing required permission.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePlatformRoles(roles: TeamRole[]): RequestHandler {
  return (request, _response, next) => {
    try {
      if (!env.PLATFORM_AUTH_ENABLED) {
        next();
        return;
      }

      const user = request.platformAuthUser;

      if (!user) {
        throw new HttpError(401, "Authentication is required.");
      }

      if (!roles.includes(user.role as TeamRole)) {
        throw new HttpError(403, "Missing required role.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
