import type { Request, Response } from "express";

import {
  completePublicInvoiceTestPayment,
  createInvoice,
  getInvoiceById,
  getPublicInvoiceByToken,
  listInvoices,
  remindInvoice,
  sendInvoice,
  startPublicInvoicePayment,
  submitPublicInvoiceVerification,
  updateInvoice,
  voidInvoice,
} from "@/features/invoices/invoice.service";
import {
  createInvoiceSchema,
  invoiceParamSchema,
  listInvoicesQuerySchema,
  publicInvoiceParamSchema,
  submitInvoiceVerificationSchema,
  updateInvoiceSchema,
} from "@/features/invoices/invoice.validation";
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

export const createInvoiceController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createInvoiceSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      environment: resolveEnvironmentScope(request),
    });
    const invoice = await createInvoice(input);

    response.status(201).json({
      success: true,
      message: input.status === "issued" ? "Invoice created and sent." : "Invoice created.",
      data: invoice,
    });
  }
);

export const listInvoicesController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listInvoicesQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      environment: resolveEnvironmentScope(request),
    });
    const invoices = await listInvoices(query);

    response.status(200).json({
      success: true,
      data: invoices.items,
      ...(invoices.pagination ? { pagination: invoices.pagination } : {}),
    });
  }
);

export const getInvoiceController = asyncHandler(
  async (request: Request, response: Response) => {
    const { invoiceId } = invoiceParamSchema.parse(request.params);
    const invoice = await getInvoiceById(
      invoiceId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      data: invoice,
    });
  }
);

export const updateInvoiceController = asyncHandler(
  async (request: Request, response: Response) => {
    const { invoiceId } = invoiceParamSchema.parse(request.params);
    const input = updateInvoiceSchema.parse(request.body);
    const invoice = await updateInvoice(
      invoiceId,
      input,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Invoice updated.",
      data: invoice,
    });
  }
);

export const sendInvoiceController = asyncHandler(
  async (request: Request, response: Response) => {
    const { invoiceId } = invoiceParamSchema.parse(request.params);
    const invoice = await sendInvoice(
      invoiceId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Invoice sent.",
      data: invoice,
    });
  }
);

export const remindInvoiceController = asyncHandler(
  async (request: Request, response: Response) => {
    const { invoiceId } = invoiceParamSchema.parse(request.params);
    const invoice = await remindInvoice(
      invoiceId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Invoice reminder sent.",
      data: invoice,
    });
  }
);

export const voidInvoiceController = asyncHandler(
  async (request: Request, response: Response) => {
    const { invoiceId } = invoiceParamSchema.parse(request.params);
    const invoice = await voidInvoice(
      invoiceId,
      resolveMerchantScope(request),
      resolveEnvironmentScope(request)
    );

    response.status(200).json({
      success: true,
      message: "Invoice voided.",
      data: invoice,
    });
  }
);

export const getPublicInvoiceController = asyncHandler(
  async (request: Request, response: Response) => {
    const { publicToken } = publicInvoiceParamSchema.parse(request.params);
    const invoice = await getPublicInvoiceByToken(publicToken);

    response.status(200).json({
      success: true,
      data: invoice,
    });
  }
);

export const startPublicInvoicePaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    const { publicToken } = publicInvoiceParamSchema.parse(request.params);
    const invoice = await startPublicInvoicePayment(publicToken);

    response.status(200).json({
      success: true,
      data: invoice,
    });
  }
);

export const submitPublicInvoiceVerificationController = asyncHandler(
  async (request: Request, response: Response) => {
    const { publicToken } = publicInvoiceParamSchema.parse(request.params);
    const input = submitInvoiceVerificationSchema.parse(request.body);
    const invoice = await submitPublicInvoiceVerification(publicToken, input);

    response.status(200).json({
      success: true,
      data: invoice,
    });
  }
);

export const completePublicInvoiceTestPaymentController = asyncHandler(
  async (request: Request, response: Response) => {
    const { publicToken } = publicInvoiceParamSchema.parse(request.params);
    const invoice = await completePublicInvoiceTestPayment(publicToken);

    response.status(200).json({
      success: true,
      data: invoice,
    });
  }
);
