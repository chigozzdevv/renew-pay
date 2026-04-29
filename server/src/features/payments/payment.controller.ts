import type { Request, Response } from "express";

import {
  createPayment,
  getPaymentById,
  listPayments,
  updatePayment,
} from "@/features/payments/payment.service";
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentParamSchema,
  updatePaymentSchema,
} from "@/features/payments/payment.validation";
import { asyncHandler } from "@/shared/utils/async-handler";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";

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

export const createPaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createPaymentSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const payment = await createPayment(input);

    response.status(201).json({
      success: true,
      message: "Payment created.",
      data: payment,
    });
  }
);

export const listPaymentsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listPaymentsQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const payments = await listPayments(query);

    response.status(200).json({
      success: true,
      data: payments.items,
      ...(payments.pagination ? { pagination: payments.pagination } : {}),
    });
  }
);

export const getPaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = paymentParamSchema.parse(request.params);
    const payment = await getPaymentById(
      params.paymentId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: payment,
    });
  }
);

export const updatePaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = paymentParamSchema.parse(request.params);
    const input = updatePaymentSchema.parse(request.body);
    const payment = await updatePayment(
      params.paymentId,
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Payment updated.",
      data: payment,
    });
  }
);
