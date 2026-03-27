import { Router } from "express";

import {
  createTeamMemberController,
  deleteTeamMemberController,
  getTeamMemberController,
  listTeamMembersController,
  resendTeamInviteController,
  revokeTeamInviteController,
  syncTeamMemberRoleController,
  updateTeamMemberController,
} from "@/features/teams/team.controller";

const teamRouter = Router();

teamRouter.get("/", listTeamMembersController);
teamRouter.post("/", createTeamMemberController);
teamRouter.get("/:teamMemberId", getTeamMemberController);
teamRouter.patch("/:teamMemberId", updateTeamMemberController);
teamRouter.delete("/:teamMemberId", deleteTeamMemberController);
teamRouter.post("/:teamMemberId/sync-role", syncTeamMemberRoleController);
teamRouter.post("/:teamMemberId/resend-invite", resendTeamInviteController);
teamRouter.post("/:teamMemberId/revoke-invite", revokeTeamInviteController);

export { teamRouter };
