import type { Request, Response } from "express";

import {
  createPlan,
  getPlanById,
  listPlans,
  updatePlan,
} from "@/features/plans/plan.service";
import {
  createPlanSchema,
  listPlansQuerySchema,
  updatePlanSchema,
} from "@/features/plans/plan.validation";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveMerchantScope(request: Request, fallback?: string) {
  return request.platformAuthUser?.merchantId ?? fallback;
}

function resolveActor(request: Request) {
  return request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export const createPlanController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createPlanSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const plan = await createPlan(input, resolveActor(request));

    response.status(201).json({
      success: true,
      message: "Plan created.",
      data: plan,
    });
  }
);

export const listPlansController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listPlansQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const plans = await listPlans(query);

    response.status(200).json({
      success: true,
      data: plans.items,
      ...(plans.pagination ? { pagination: plans.pagination } : {}),
    });
  }
);

export const getPlanController = asyncHandler(
  async (request: Request, response: Response) => {
    const plan = await getPlanById(
      String(request.params.planId),
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: plan,
    });
  }
);

export const updatePlanController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = updatePlanSchema.parse(request.body);
    const plan = await updatePlan(
      String(request.params.planId),
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request),
      resolveActor(request)
    );

    response.status(200).json({
      success: true,
      message: "Plan updated.",
      data: plan,
    });
  }
);
