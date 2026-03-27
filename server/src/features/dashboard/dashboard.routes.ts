import { Router } from "express";

import {
  getDashboardMarketCatalogController,
  getDashboardOverviewController,
  getDashboardPlanMarketQuoteController,
} from "@/features/dashboard/dashboard.controller";

const dashboardRouter = Router();

dashboardRouter.get("/overview", getDashboardOverviewController);
dashboardRouter.get("/market-catalog", getDashboardMarketCatalogController);
dashboardRouter.get("/market-quote", getDashboardPlanMarketQuoteController);

export { dashboardRouter };
