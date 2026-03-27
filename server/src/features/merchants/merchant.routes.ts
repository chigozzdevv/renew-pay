import { Router } from "express";

import {
  createMerchantController,
  getMerchantController,
  listMerchantsController,
  updateMerchantController,
} from "@/features/merchants/merchant.controller";

const merchantRouter = Router();

merchantRouter.get("/", listMerchantsController);
merchantRouter.post("/", createMerchantController);
merchantRouter.get("/:merchantId", getMerchantController);
merchantRouter.patch("/:merchantId", updateMerchantController);

export { merchantRouter };
