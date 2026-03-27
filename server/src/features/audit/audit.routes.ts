import { Router } from "express";

import {
  createAuditController,
  listAuditController,
} from "@/features/audit/audit.controller";

const auditRouter = Router();

auditRouter.get("/", listAuditController);
auditRouter.post("/", createAuditController);

export { auditRouter };
