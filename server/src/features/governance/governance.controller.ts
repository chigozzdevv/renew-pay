import type { Request, Response } from "express";

import {
  enableGovernance,
  getGovernanceState,
} from "@/features/governance/governance.service";
import {
  enableGovernanceSchema,
  governanceQuerySchema,
} from "@/features/governance/governance.validation";
import { asyncHandler } from "@/shared/utils/async-handler";
import { HttpError } from "@/shared/errors/http-error";

function requireSessionMerchantId(request: Request) {
  const merchantId = request.platformAuthUser?.merchantId;

  if (!merchantId) {
    throw new HttpError(401, "Authenticated merchant scope is required.");
  }

  return merchantId;
}

function resolveActor(request: Request) {
  return request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
}

export const getGovernanceController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = governanceQuerySchema.parse(request.query);
    const governance = await getGovernanceState(
      requireSessionMerchantId(request),
      query.environment
    );

    response.status(200).json({
      success: true,
      data: governance,
    });
  }
);

export const enableGovernanceController = asyncHandler(
  async (request: Request, response: Response) => {
    const payload = enableGovernanceSchema.parse(request.body);
    const governance = await enableGovernance({
      merchantId: requireSessionMerchantId(request),
      actor: resolveActor(request),
      payload,
    });

    response.status(200).json({
      success: true,
      message: payload.enabled ? "Governance enabled." : "Governance disabled.",
      data: governance,
    });
  }
);
