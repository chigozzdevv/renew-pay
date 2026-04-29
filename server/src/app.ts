import cors from "cors";
import express from "express";

import { getAllowedCorsOrigins } from "@/config/env.config";
import { auditRouter } from "@/features/audit/audit.routes";
import { authRouter } from "@/features/auth/auth.routes";
import { customerRouter } from "@/features/customers/customer.routes";
import { developerRouter } from "@/features/developers/developer.routes";
import { historyRouter } from "@/features/history/history.routes";
import { kycRouter } from "@/features/kyc/kyc.routes";
import { merchantRouter } from "@/features/merchants/merchant.routes";
import { mediaRouter } from "@/features/media/media.routes";
import { notificationRouter } from "@/features/notifications/notification.routes";
import { onboardingRouter } from "@/features/onboarding/onboarding.routes";
import { overviewRouter } from "@/features/overview/overview.routes";
import { paymentRailRouter } from "@/features/payment-rails/payment-rails.routes";
import { paymentRouter } from "@/features/payments/payment.routes";
import { payoutRouter } from "@/features/payouts/payout.routes";
import { protocolRouter } from "@/features/protocol/protocol.routes";
import { settlementRouter } from "@/features/settlement/settlement.routes";
import { settingRouter } from "@/features/settings/setting.routes";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error-handler";
import { blockLiveModeUntilLaunch } from "@/shared/middleware/live-mode-launch-gate";
import {
  requirePlatformAuth,
  requirePlatformPermissions,
} from "@/shared/middleware/platform-auth";

export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedCorsOrigins();

  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) {
          callback(null, true);
          return;
        }

        if (
          allowedOrigins.includes("*") ||
          allowedOrigins.includes(requestOrigin)
        ) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin is not allowed by CORS."));
      },
      credentials: false,
    })
  );
  app.use(
    express.json({
      limit: "1mb",
      verify: (request, _response, buffer) => {
        (request as { rawBody?: string }).rawBody = buffer.toString("utf8");
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (_request, response) => {
    response.status(200).json({
      success: true,
      message: "Renew server is healthy.",
    });
  });

  const registerApiRoutes = (apiBasePath: string) => {
    app.use(`${apiBasePath}/protocol`, protocolRouter);
    app.use(`${apiBasePath}/auth`, authRouter);
    app.use(`${apiBasePath}/onboarding`, onboardingRouter);
    app.use(`${apiBasePath}/kyc`, kycRouter);
    app.use(`${apiBasePath}/payment-rails`, paymentRailRouter);
    app.use(
      `${apiBasePath}/media`,
      requirePlatformAuth,
      mediaRouter
    );
    app.use(
      `${apiBasePath}/merchants`,
      requirePlatformAuth,
      requirePlatformPermissions(["settings"]),
      merchantRouter
    );
    app.use(
      `${apiBasePath}/overview`,
      requirePlatformAuth,
      requirePlatformPermissions([
        "customers",
        "payments",
        "settlement",
        "payouts",
        "history",
        "developers",
        "settings",
      ]),
      blockLiveModeUntilLaunch(),
      overviewRouter
    );
    app.use(
      `${apiBasePath}/customers`,
      requirePlatformAuth,
      requirePlatformPermissions(["customers", "settings"]),
      blockLiveModeUntilLaunch(),
      customerRouter
    );
    app.use(
      `${apiBasePath}/payments`,
      requirePlatformAuth,
      requirePlatformPermissions(["payments", "settings"]),
      blockLiveModeUntilLaunch(),
      paymentRouter
    );
    app.use(
      `${apiBasePath}/settlement`,
      requirePlatformAuth,
      requirePlatformPermissions(["settlement", "settings"]),
      blockLiveModeUntilLaunch(),
      settlementRouter
    );
    app.use(
      `${apiBasePath}/payouts`,
      requirePlatformAuth,
      requirePlatformPermissions(["payouts", "settings"]),
      blockLiveModeUntilLaunch(),
      payoutRouter
    );
    app.use(
      `${apiBasePath}/history`,
      requirePlatformAuth,
      requirePlatformPermissions(["history", "settings"]),
      blockLiveModeUntilLaunch(),
      historyRouter
    );
    app.use(
      `${apiBasePath}/developers`,
      requirePlatformAuth,
      requirePlatformPermissions(["developers", "settings"]),
      blockLiveModeUntilLaunch(),
      developerRouter
    );
    app.use(
      `${apiBasePath}/settings`,
      requirePlatformAuth,
      requirePlatformPermissions(["settings"]),
      blockLiveModeUntilLaunch(),
      settingRouter
    );
    app.use(
      `${apiBasePath}/notifications`,
      notificationRouter
    );
    app.use(
      `${apiBasePath}/audit`,
      requirePlatformAuth,
      requirePlatformPermissions(["settings"]),
      auditRouter
    );
  };

  registerApiRoutes("/v1");
  registerApiRoutes("/api/v1");
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
