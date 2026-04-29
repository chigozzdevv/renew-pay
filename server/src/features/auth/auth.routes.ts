import { Router } from "express";

import {
  getCurrentSessionController,
  privySessionController,
} from "@/features/auth/auth.controller";
import { requirePlatformAuth } from "@/shared/middleware/platform-auth";

const authRouter = Router();

authRouter.post("/privy/session", privySessionController);
authRouter.get("/me", requirePlatformAuth, getCurrentSessionController);

export { authRouter };
