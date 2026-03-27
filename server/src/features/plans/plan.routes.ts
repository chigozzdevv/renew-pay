import { Router } from "express";

import {
  createPlanController,
  getPlanController,
  listPlansController,
  updatePlanController,
} from "@/features/plans/plan.controller";

const planRouter = Router();

planRouter.get("/", listPlansController);
planRouter.post("/", createPlanController);
planRouter.get("/:planId", getPlanController);
planRouter.patch("/:planId", updatePlanController);

export { planRouter };
