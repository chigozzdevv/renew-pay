import { Router } from "express";

import { createPlaygroundCollectionController } from "@/features/playground/playground.controller";

const playgroundRouter = Router();

playgroundRouter.post("/collections", createPlaygroundCollectionController);

export { playgroundRouter };
