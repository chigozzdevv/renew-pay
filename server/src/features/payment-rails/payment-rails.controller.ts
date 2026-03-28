import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";

import {
  getPartnaConfig,
} from "@/config/partna.config";
import {
  acceptCollectionRequest,
  createWidgetQuote,
  enqueuePaymentRailSync,
  getCollectionRequest,
  listChannels,
  listNetworks,
  denyCollectionRequest,
  processYellowCardWebhook,
  resolveBankAccount,
  syncChannels,
  syncNetworks,
} from "@/features/payment-rails/payment-rails.service";
import {
  processPartnaWebhook,
  verifyPartnaWebhookSignature,
} from "@/features/payment-rails/partna.service";
import {
  collectionParamSchema,
  createWidgetQuoteSchema,
  listChannelsQuerySchema,
  listNetworksQuerySchema,
  partnaWebhookSchema,
  resolveBankAccountSchema,
  syncPaymentRailSchema,
  yellowCardWebhookSchema,
} from "@/features/payment-rails/payment-rails.validation";
import { getYellowCardConfig } from "@/config/yellow-card.config";
import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

function normalizeSignature(value: string) {
  const cleaned = value.trim();

  if (!cleaned) {
    return "";
  }

  const parts = cleaned.split("=");
  const signature = parts.length === 2 ? parts[1] : parts[0];
  return signature.trim();
}

function verifyWebhookSignature(rawBody: string, headerValue: string, secret: string) {
  const receivedSignature = normalizeSignature(headerValue);

  if (!receivedSignature) {
    return false;
  }

  const expectedHashBuffer = createHmac("sha256", secret).update(rawBody).digest();
  const expectedBase64Buffer = Buffer.from(expectedHashBuffer.toString("base64"), "utf8");
  const expectedHexBuffer = Buffer.from(expectedHashBuffer.toString("hex"), "utf8");
  const receivedBuffer = Buffer.from(receivedSignature, "utf8");

  if (receivedBuffer.length === expectedBase64Buffer.length) {
    return timingSafeEqual(expectedBase64Buffer, receivedBuffer);
  }

  if (receivedBuffer.length === expectedHexBuffer.length) {
    return timingSafeEqual(expectedHexBuffer, receivedBuffer);
  }

  return false;
}

function resolveEnvironmentScope(request: Request) {
  return optionalEnvironmentInputSchema.parse(
    typeof request.query.environment === "string"
      ? request.query.environment
      : request.body?.environment
  );
}

export const listChannelsController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listChannelsQuerySchema.parse({
      ...request.query,
      environment: resolveEnvironmentScope(request),
    });
    const channels = await listChannels(query);

    response.status(200).json({
      success: true,
      data: channels,
    });
  }
);

export const syncChannelsController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = syncPaymentRailSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const channels = await syncChannels(input);

    response.status(200).json({
      success: true,
      message: "Payment channels synced.",
      data: channels,
    });
  }
);

export const listNetworksController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listNetworksQuerySchema.parse({
      ...request.query,
      environment: resolveEnvironmentScope(request),
    });
    const networks = await listNetworks(query);

    response.status(200).json({
      success: true,
      data: networks,
    });
  }
);

export const syncNetworksController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = syncPaymentRailSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const networks = await syncNetworks(input);

    response.status(200).json({
      success: true,
      message: "Payment networks synced.",
      data: networks,
    });
  }
);

export const enqueuePaymentRailSyncController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = syncPaymentRailSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const job = await enqueuePaymentRailSync(input);

    response.status(202).json({
      success: true,
      message: "Payment rail sync queued.",
      data: job,
    });
  }
);

export const createWidgetQuoteController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = createWidgetQuoteSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const quote = await createWidgetQuote(input);

    response.status(200).json({
      success: true,
      data: quote,
    });
  }
);

export const resolveBankAccountController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = resolveBankAccountSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const result = await resolveBankAccount(input);

    response.status(200).json({
      success: true,
      data: result,
    });
  }
);

export const getCollectionRequestController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = collectionParamSchema.parse(request.params);
    const environment = resolveEnvironmentScope(request) ?? "test";
    const result = await getCollectionRequest(params.collectionId, environment);

    response.status(200).json({
      success: true,
      data: result,
    });
  }
);

export const acceptCollectionRequestController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = collectionParamSchema.parse(request.params);
    const environment = resolveEnvironmentScope(request) ?? "test";
    const result = await acceptCollectionRequest(params.collectionId, environment);

    response.status(200).json({
      success: true,
      message: "Collection request accepted.",
      data: result,
    });
  }
);

export const denyCollectionRequestController = asyncHandler(
  async (request: Request, response: Response) => {
    const params = collectionParamSchema.parse(request.params);
    const environment = resolveEnvironmentScope(request) ?? "test";
    const result = await denyCollectionRequest(params.collectionId, environment);

    response.status(200).json({
      success: true,
      message: "Collection request denied.",
      data: result,
    });
  }
);

export const processYellowCardWebhookController = asyncHandler(
  async (request: Request, response: Response) => {
    const testConfig = getYellowCardConfig("test");
    const liveConfig = getYellowCardConfig("live");
    const configuredSecrets = [testConfig.webhookSecret, liveConfig.webhookSecret].filter(
      (secret) => secret.length > 0
    );

    let matchedEnvironment: RuntimeMode | null = null;

    if (configuredSecrets.length > 0) {
      const signatureHeader =
        request.header("x-yc-signature") ?? request.header("x-signature") ?? "";
      const candidateModes: RuntimeMode[] = ["test", "live"];
      matchedEnvironment =
        candidateModes.find((mode) =>
          verifyWebhookSignature(
            request.rawBody ?? "",
            signatureHeader,
            getYellowCardConfig(mode).webhookSecret
          )
        ) ?? null;

      if (
        !request.rawBody ||
        !matchedEnvironment
      ) {
        throw new HttpError(401, "Invalid Yellow Card webhook signature.");
      }
    }

    const input = yellowCardWebhookSchema.parse({
      ...request.body,
      environment: matchedEnvironment ?? resolveEnvironmentScope(request),
    });
    const result = await processYellowCardWebhook(
      input,
      matchedEnvironment ?? undefined
    );

    response.status(202).json({
      success: true,
      message: "Yellow Card webhook processed.",
      data: result,
    });
  }
);

export const processPartnaWebhookController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = partnaWebhookSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });

    const candidateModes: RuntimeMode[] = ["test", "live"];
    const matchedEnvironment =
      candidateModes.find((mode) => {
        const publicKey = getPartnaConfig(mode).webhookPublicKey;

        if (!publicKey || !input.signature || !input.data) {
          return false;
        }

        return verifyPartnaWebhookSignature({
          data: input.data,
          signature: input.signature,
          publicKey,
        });
      }) ?? null;

    if (!matchedEnvironment) {
      throw new HttpError(401, "Invalid Partna webhook signature.");
    }

    const result = await processPartnaWebhook(
      input,
      matchedEnvironment
    );

    response.status(202).json({
      success: true,
      message: "Partna webhook processed.",
      data: result,
    });
  }
);
