import type { NextFunction, Request, Response, RequestHandler } from "express";

import {
  hasDeveloperKeyCredentials,
  requireDeveloperKeyAuth,
} from "@/shared/middleware/developer-key-auth";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";
import type { AppPermission } from "@/shared/constants/access-control";

export function requireWorkspaceApiAuth(
  permissions: AppPermission[]
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    if (hasDeveloperKeyCredentials(request)) {
      requireDeveloperKeyAuth(request, response, next);
      return;
    }

    requirePlatformAuth(request, response, (authError?: unknown) => {
      if (authError) {
        next(authError);
        return;
      }

      requirePlatformPermissions(permissions)(request, response, next);
    });
  };
}
