import type { Request, Response } from "express";

import {
  quoteCheckoutSessionMarket,
  completeCheckoutTestPayment,
  createCheckoutSession,
  getCheckoutSession,
  listCheckoutPlans,
  submitCheckoutCustomer,
  submitCheckoutVerification,
} from "@/features/checkout/checkout.service";
import {
  checkoutMarketQuoteQuerySchema,
  checkoutSessionParamSchema,
  createCheckoutSessionSchema,
  submitCheckoutCustomerSchema,
  submitCheckoutVerificationSchema,
} from "@/features/checkout/checkout.validation";
import { HttpError } from "@/shared/errors/http-error";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolvePlatformCheckoutEnvironment(request: Request) {
  const body =
    typeof request.body === "object" && request.body !== null ? request.body : {};

  return (
    optionalEnvironmentInputSchema.parse(
      ("environment" in body ? body.environment : undefined) ?? request.query.environment
    ) ?? request.platformAuthUser?.workspaceMode ?? "test"
  );
}

export const createCheckoutSessionController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.developerAuth) {
      throw new HttpError(401, "Developer key context is missing.");
    }

    const input = createCheckoutSessionSchema.parse(request.body);
    const session = await createCheckoutSession(input, request.developerAuth);

    response.status(201).json({
      success: true,
      message: "Checkout session created.",
      data: session,
    });
  }
);

export const listCheckoutPlansController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.developerAuth) {
      throw new HttpError(401, "Developer key context is missing.");
    }

    const plans = await listCheckoutPlans(request.developerAuth);

    response.status(200).json({
      success: true,
      data: plans,
    });
  }
);

export const listWorkspaceCheckoutPlansController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.platformAuthUser) {
      throw new HttpError(401, "Workspace session is required.");
    }

    const plans = await listCheckoutPlans({
      developerKeyId: null,
      merchantId: request.platformAuthUser.merchantId,
      environment: resolvePlatformCheckoutEnvironment(request),
      label: `workspace:${request.platformAuthUser.teamMemberId}`,
    });

    response.status(200).json({
      success: true,
      data: plans,
    });
  }
);

export const createWorkspaceCheckoutSessionController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.platformAuthUser) {
      throw new HttpError(401, "Workspace session is required.");
    }

    const input = createCheckoutSessionSchema.parse(request.body);
    const session = await createCheckoutSession(input, {
      developerKeyId: null,
      merchantId: request.platformAuthUser.merchantId,
      environment: resolvePlatformCheckoutEnvironment(request),
      label: `workspace:${request.platformAuthUser.teamMemberId}`,
    });

    response.status(201).json({
      success: true,
      message: "Checkout session created.",
      data: session,
    });
  }
);

export const getCheckoutSessionController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.checkoutSessionAuth) {
      throw new HttpError(401, "Checkout session context is missing.");
    }

    const params = checkoutSessionParamSchema.parse(request.params);
    const session = await getCheckoutSession(params.sessionId);

    response.status(200).json({
      success: true,
      data: session,
    });
  }
);

export const submitCheckoutCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.checkoutSessionAuth) {
      throw new HttpError(401, "Checkout session context is missing.");
    }

    const params = checkoutSessionParamSchema.parse(request.params);
    const input = submitCheckoutCustomerSchema.parse(request.body);
    const session = await submitCheckoutCustomer(params.sessionId, input);

    response.status(200).json({
      success: true,
      message: "Checkout customer submitted.",
      data: session,
    });
  }
);

export const submitCheckoutVerificationController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.checkoutSessionAuth) {
      throw new HttpError(401, "Checkout session context is missing.");
    }

    const params = checkoutSessionParamSchema.parse(request.params);
    const input = submitCheckoutVerificationSchema.parse(request.body);
    const session = await submitCheckoutVerification(params.sessionId, input);

    response.status(200).json({
      success: true,
      message: "Checkout verification submitted.",
      data: session,
    });
  }
);

export const quoteCheckoutSessionMarketController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.checkoutSessionAuth) {
      throw new HttpError(401, "Checkout session context is missing.");
    }

    const params = checkoutSessionParamSchema.parse(request.params);
    const query = checkoutMarketQuoteQuerySchema.parse(request.query);
    const quote = await quoteCheckoutSessionMarket(params.sessionId, query.market);

    response.status(200).json({
      success: true,
      data: quote,
    });
  }
);

export const completeCheckoutTestPaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    if (!request.checkoutSessionAuth) {
      throw new HttpError(401, "Checkout session context is missing.");
    }

    const params = checkoutSessionParamSchema.parse(request.params);
    const session = await completeCheckoutTestPayment(params.sessionId);

    response.status(200).json({
      success: true,
      message: "Test payment completed.",
      data: session,
    });
  }
);
