import { Router } from "express";

import { createMerchantLogoUploadSignatureController } from "@/features/media/media.controller";
import {
  requirePlatformPermissions,
  requirePlatformRoles,
} from "@/shared/middleware/platform-auth";

const mediaRouter = Router();

mediaRouter.post(
  "/cloudinary/logo-signature",
  requirePlatformRoles(["owner", "admin"]),
  requirePlatformPermissions(["team_admin"]),
  createMerchantLogoUploadSignatureController
);

export { mediaRouter };
