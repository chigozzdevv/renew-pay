import cors from "cors";
import express from "express";

import { getAllowedCorsOrigins } from "@/config/env.config";
import { authRouter } from "@/features/auth/auth.routes";
import { chargeRouter } from "@/features/charges/charge.routes";
import { checkoutRouter } from "@/features/checkout/checkout.routes";
import { customerRouter } from "@/features/customers/customer.routes";
import { dashboardRouter } from "@/features/dashboard/dashboard.routes";
import { developerRouter } from "@/features/developers/developer.routes";
import { invoiceRouter, publicInvoiceRouter } from "@/features/invoices/invoice.routes";
import { kycRouter } from "@/features/kyc/kyc.routes";
import { merchantRouter } from "@/features/merchants/merchant.routes";
import { mediaRouter } from "@/features/media/media.routes";
import { notificationRouter } from "@/features/notifications/notification.routes";
import { onboardingRouter } from "@/features/onboarding/onboarding.routes";
import { paymentRailRouter } from "@/features/payment-rails/payment-rails.routes";
import { planRouter } from "@/features/plans/plan.routes";
import { protocolRouter } from "@/features/protocol/protocol.routes";
import { auditRouter } from "@/features/audit/audit.routes";
import { settlementRouter } from "@/features/settlements/settlement.routes";
import { settingRouter } from "@/features/settings/setting.routes";
import { subscriptionRouter } from "@/features/subscriptions/subscription.routes";
import { teamRouter } from "@/features/teams/team.routes";
import { treasuryRouter } from "@/features/treasury/treasury.routes";
import { governanceRouter } from "@/features/governance/governance.routes";
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
    app.use(`${apiBasePath}/governance`, governanceRouter);
    app.use(`${apiBasePath}/checkout`, checkoutRouter);
    app.use(`${apiBasePath}/invoices/public`, publicInvoiceRouter);
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
      requirePlatformPermissions(["team_admin"]),
      merchantRouter
    );
    app.use(
      `${apiBasePath}/dashboard`,
      requirePlatformAuth,
      requirePlatformPermissions([
        "customers",
        "plans",
        "subscriptions",
        "invoices",
        "payments",
        "treasury",
        "developers",
        "team_admin",
      ]),
      blockLiveModeUntilLaunch(),
      dashboardRouter
    );
    app.use(
      `${apiBasePath}/customers`,
      requirePlatformAuth,
      requirePlatformPermissions(["customers", "team_admin"]),
      blockLiveModeUntilLaunch(),
      customerRouter
    );
    app.use(
      `${apiBasePath}/plans`,
      requirePlatformAuth,
      requirePlatformPermissions(["plans", "team_admin"]),
      blockLiveModeUntilLaunch(),
      planRouter
    );
    app.use(
      `${apiBasePath}/subscriptions`,
      requirePlatformAuth,
      requirePlatformPermissions(["subscriptions", "team_admin"]),
      blockLiveModeUntilLaunch(),
      subscriptionRouter
    );
    app.use(
      `${apiBasePath}/invoices`,
      requirePlatformAuth,
      requirePlatformPermissions(["invoices", "team_admin"]),
      blockLiveModeUntilLaunch(),
      invoiceRouter
    );
    app.use(
      `${apiBasePath}/charges`,
      requirePlatformAuth,
      requirePlatformPermissions(["payments", "team_admin"]),
      blockLiveModeUntilLaunch(),
      chargeRouter
    );
    app.use(
      `${apiBasePath}/settlements`,
      requirePlatformAuth,
      requirePlatformPermissions(["treasury", "team_admin"]),
      blockLiveModeUntilLaunch(),
      settlementRouter
    );
    app.use(
      `${apiBasePath}/developers`,
      requirePlatformAuth,
      requirePlatformPermissions(["developers", "team_admin"]),
      blockLiveModeUntilLaunch(),
      developerRouter
    );
    app.use(
      `${apiBasePath}/treasury`,
      requirePlatformAuth,
      requirePlatformPermissions(["treasury", "team_admin"]),
      blockLiveModeUntilLaunch(),
      treasuryRouter
    );
    app.use(
      `${apiBasePath}/teams`,
      requirePlatformAuth,
      requirePlatformPermissions(["team_admin"]),
      teamRouter
    );
    app.use(
      `${apiBasePath}/settings`,
      requirePlatformAuth,
      requirePlatformPermissions(["team_admin", "treasury"]),
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
      requirePlatformPermissions(["team_admin"]),
      auditRouter
    );
  };

  registerApiRoutes("/v1");
  registerApiRoutes("/api/v1");
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
