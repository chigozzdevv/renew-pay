import { Router } from "express";

import {
  createSubscriptionController,
  getSubscriptionController,
  listSubscriptionsController,
  queueSubscriptionChargeController,
  updateSubscriptionController,
} from "@/features/subscriptions/subscription.controller";

const subscriptionRouter = Router();

subscriptionRouter.get("/", listSubscriptionsController);
subscriptionRouter.post("/", createSubscriptionController);
subscriptionRouter.get("/:subscriptionId", getSubscriptionController);
subscriptionRouter.patch("/:subscriptionId", updateSubscriptionController);
subscriptionRouter.post(
  "/:subscriptionId/queue-charge",
  queueSubscriptionChargeController
);

export { subscriptionRouter };
