import { Router } from "express";

import { listHistoryController } from "@/features/history/history.controller";

const historyRouter = Router();

historyRouter.get("/", listHistoryController);

export { historyRouter };
