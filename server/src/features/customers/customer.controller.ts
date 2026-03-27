import type { Request, Response } from "express";

import {
  blacklistCustomer,
  createCustomer,
  getCustomerById,
  listCustomers,
  pauseCustomerBilling,
  resumeCustomerBilling,
  updateCustomer,
} from "@/features/customers/customer.service";
import {
  blacklistCustomerSchema,
  createCustomerSchema,
  customerActionSchema,
  customerParamSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "@/features/customers/customer.validation";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveActor(request: Request) {
  return request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
}

function resolveMerchantScope(request: Request, fallback?: string) {
  return request.platformAuthUser?.merchantId ?? fallback;
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export const listCustomersController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listCustomersQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const customers = await listCustomers(query);

    response.status(200).json({
      success: true,
      data: customers.items,
      ...(customers.pagination ? { pagination: customers.pagination } : {}),
    });
  }
);

export const getCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = customerParamSchema.parse(request.params);
    const action = customerActionSchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const customer = await getCustomerById(
      params.customerId,
      action.merchantId,
      action.environment
    );

    response.status(200).json({
      success: true,
      data: customer,
    });
  }
);

export const createCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createCustomerSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const customer = await createCustomer(input);

    response.status(201).json({
      success: true,
      message: "Customer created.",
      data: customer,
    });
  }
);

export const updateCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = customerParamSchema.parse(request.params);
    const action = customerActionSchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const input = updateCustomerSchema.parse({
      ...request.body,
      actor: resolveActor(request),
    });
    const customer = await updateCustomer(
      params.customerId,
      action.merchantId,
      action.environment,
      input
    );

    response.status(200).json({
      success: true,
      message: "Customer updated.",
      data: customer,
    });
  }
);

export const pauseCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = customerParamSchema.parse(request.params);
    const input = customerActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const customer = await pauseCustomerBilling(params.customerId, input);

    response.status(200).json({
      success: true,
      message: "Customer billing paused.",
      data: customer,
    });
  }
);

export const resumeCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = customerParamSchema.parse(request.params);
    const input = customerActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const customer = await resumeCustomerBilling(params.customerId, input);

    response.status(200).json({
      success: true,
      message: "Customer billing resumed.",
      data: customer,
    });
  }
);

export const blacklistCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = customerParamSchema.parse(request.params);
    const input = blacklistCustomerSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
      actor: resolveActor(request),
    });
    const customer = await blacklistCustomer(params.customerId, input);

    response.status(200).json({
      success: true,
      message: "Customer blacklisted.",
      data: customer,
    });
  }
);
