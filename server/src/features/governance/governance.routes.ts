import { Router } from "express";

import {
  enableGovernanceController,
  getGovernanceController,
} from "@/features/governance/governance.controller";
import { requirePlatformAuth, requirePlatformRoles } from "@/shared/middleware/platform-auth";

const governanceRouter = Router();

governanceRouter.use(requirePlatformAuth);

governanceRouter.get("/", getGovernanceController);
governanceRouter.post(
  "/enable",
  requirePlatformRoles(["owner", "admin"]),
  enableGovernanceController
);

export { governanceRouter };
