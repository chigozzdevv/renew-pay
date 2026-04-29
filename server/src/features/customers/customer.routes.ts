import { Router } from "express";

import {
  blacklistCustomerController,
  createCustomerController,
  getCustomerController,
  listCustomersController,
  updateCustomerController,
} from "@/features/customers/customer.controller";

const customerRouter = Router();

customerRouter.get("/", listCustomersController);
customerRouter.post("/", createCustomerController);
customerRouter.get("/:customerId", getCustomerController);
customerRouter.patch("/:customerId", updateCustomerController);
customerRouter.post("/:customerId/blacklist", blacklistCustomerController);

export { customerRouter };
