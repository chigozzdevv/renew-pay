import type { Request, Response } from "express";

import {
  cancelCollection,
  confirmPublicCheckoutOtp,
  confirmPublicCheckoutPhone,
  createCollection,
  createPayment,
  createPublicPaymentIssue,
  createPublicPaymentIssueFileUpload,
  getCollectionById,
  getPaymentById,
  getPublicPayment,
  listPublicCheckoutBanks,
  listCollections,
  listPayments,
  selectPublicCheckoutKycMethod,
  startPublicPayment,
  startPublicCheckoutKyc,
  submitPublicCheckoutCustomer,
  updatePayment,
} from "@/features/payments/payment.service";
import {
  collectionParamSchema,
  confirmPublicCheckoutOtpSchema,
  confirmPublicCheckoutPhoneSchema,
  createCollectionSchema,
  createPublicPaymentIssueSchema,
  createPaymentSchema,
  listCollectionsQuerySchema,
  listPaymentsQuerySchema,
  paymentParamSchema,
  publicPaymentParamSchema,
  selectPublicCheckoutKycMethodSchema,
  startPublicCheckoutKycSchema,
  startPublicPaymentSchema,
  submitPublicCheckoutCustomerSchema,
  updatePaymentSchema,
} from "@/features/payments/payment.validation";
import { asyncHandler } from "@/shared/utils/async-handler";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";

function resolveMerchantScope(request: Request, fallback?: string) {
  return request.platformAuthUser?.merchantId ?? request.developerAuth?.merchantId ?? fallback;
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    request.developerAuth?.environment ??
    (typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment)
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

export const createCollectionController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createCollectionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const collection = await createCollection(input);

    response.status(201).json({
      success: true,
      message: "Collection created.",
      data: collection,
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

export const listCollectionsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listCollectionsQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const collections = await listCollections(query);

    response.status(200).json({
      success: true,
      data: collections.items,
      ...(collections.pagination ? { pagination: collections.pagination } : {}),
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

export const getCollectionController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = collectionParamSchema.parse(request.params);
    const collection = await getCollectionById(
      params.collectionId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: collection,
    });
  }
);

export const cancelCollectionController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = collectionParamSchema.parse(request.params);
    const collection = await cancelCollection(
      params.collectionId,
      resolveMerchantScope(request, request.body?.merchantId),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Collection cancelled.",
      data: collection,
    });
  }
);

export const getPublicPaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const payment = await getPublicPayment(params.payId);

    response.status(200).json({
      success: true,
      data: payment,
    });
  }
);

export const listPublicCheckoutBanksController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const banks = await listPublicCheckoutBanks(params.payId);

    response.status(200).json({
      success: true,
      data: banks,
    });
  }
);

export const createPublicPaymentIssueFileUploadController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const signature = await createPublicPaymentIssueFileUpload(params.payId);

    response.status(200).json({
      success: true,
      data: signature,
    });
  }
);

export const createPublicPaymentIssueController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const input = createPublicPaymentIssueSchema.parse(request.body);
    const issue = await createPublicPaymentIssue(params.payId, input);

    response.status(201).json({
      success: true,
      message: "Report received.",
      data: issue,
    });
  }
);

export const startPublicPaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const input = startPublicPaymentSchema.parse(request.body);
    const payment = await startPublicPayment(params.payId, input);

    response.status(200).json({
      success: true,
      data: payment,
    });
  }
);

export const submitPublicCheckoutCustomerController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const input = submitPublicCheckoutCustomerSchema.parse(request.body);
    const payment = await submitPublicCheckoutCustomer(params.payId, input);

    response.status(200).json({
      success: true,
      data: payment,
    });
  }
);

export const startPublicCheckoutKycController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const input = startPublicCheckoutKycSchema.parse(request.body);
    const payment = await startPublicCheckoutKyc(params.payId, input);

    response.status(200).json({
      success: true,
      data: payment,
    });
  }
);

export const selectPublicCheckoutKycMethodController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const input = selectPublicCheckoutKycMethodSchema.parse(request.body);
    const payment = await selectPublicCheckoutKycMethod(params.payId, input);

    response.status(200).json({
      success: true,
      data: payment,
    });
  }
);

export const confirmPublicCheckoutPhoneController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const input = confirmPublicCheckoutPhoneSchema.parse(request.body);
    const payment = await confirmPublicCheckoutPhone(params.payId, input);

    response.status(200).json({
      success: true,
      data: payment,
    });
  }
);

export const confirmPublicCheckoutOtpController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = publicPaymentParamSchema.parse(request.params);
    const input = confirmPublicCheckoutOtpSchema.parse(request.body);
    const payment = await confirmPublicCheckoutOtp(params.payId, input);

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
