import { Router } from "express";

import {
  getOverviewController,
  getOverviewMarketCatalogController,
  getOverviewMarketQuoteController,
} from "@/features/overview/overview.controller";

const overviewRouter = Router();

overviewRouter.get("/", getOverviewController);
overviewRouter.get("/market-catalog", getOverviewMarketCatalogController);
overviewRouter.get("/market-quote", getOverviewMarketQuoteController);

export { overviewRouter };
