import type { Request, Response } from "express";

import { getPartnaConfig } from "@/config/partna.config";
import {
  createWidgetQuote,
  enqueueOnrampSync,
  listChannels,
  listNetworks,
  syncChannels,
  syncNetworks,
} from "@/features/onramps/onramp.service";
import {
  processPartnaWebhook,
  verifyPartnaWebhookSignature,
} from "@/features/onramps/partna.service";
import {
  createWidgetQuoteSchema,
  listChannelsQuerySchema,
  listNetworksQuerySchema,
  partnaWebhookSchema,
  syncOnrampSchema,
} from "@/features/onramps/onramp.validation";
import { HttpError } from "@/shared/errors/http-error";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { optionalEnvironmentInputSchema } from "@/shared/utils/runtime-environment";
import { asyncHandler } from "@/shared/utils/async-handler";

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
    const input = syncOnrampSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const channels = await syncChannels(input);

    response.status(200).json({
      success: true,
      message: "Onramp channels synced.",
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
    const input = syncOnrampSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const networks = await syncNetworks(input);

    response.status(200).json({
      success: true,
      message: "Onramp networks synced.",
      data: networks,
    });
  }
);

export const enqueueOnrampSyncController = asyncHandler(
  async (request: Request, response: Response) => {
    const input = syncOnrampSchema.parse({
      ...request.body,
      environment: resolveEnvironmentScope(request),
    });
    const job = await enqueueOnrampSync(input);

    response.status(202).json({
      success: true,
      message: "Onramp sync queued.",
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
