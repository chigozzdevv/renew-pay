import { Router } from "express";

import { getProtocolStatusController } from "@/features/protocol/protocol.controller";

const protocolRouter = Router();

protocolRouter.get("/", getProtocolStatusController);

export { protocolRouter };
