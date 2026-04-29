import { Router } from "express";

import { createMerchantLogoUploadSignatureController } from "@/features/media/media.controller";
import { requirePlatformPermissions } from "@/shared/middleware/platform-auth";

const mediaRouter = Router();

mediaRouter.post(
  "/cloudinary/logo-signature",
  requirePlatformPermissions(["settings"]),
  createMerchantLogoUploadSignatureController
);

export { mediaRouter };
