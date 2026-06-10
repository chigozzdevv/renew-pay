import { Router } from "express";

import { createDemoCollectionController } from "@/features/demo/demo.controller";

const demoRouter = Router();

demoRouter.post("/collections", createDemoCollectionController);

export { demoRouter };
