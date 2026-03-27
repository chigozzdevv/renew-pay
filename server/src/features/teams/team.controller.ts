import type { Request, Response } from "express";

import {
  createTeamMember,
  deleteTeamMember,
  getTeamMemberById,
  listTeamMembers,
  resendTeamInvite,
  revokeTeamInvite,
  syncTeamMemberRoleDefaults,
  updateTeamMember,
} from "@/features/teams/team.service";
import {
  createTeamMemberSchema,
  listTeamMembersQuerySchema,
  teamMemberActionSchema,
  updateTeamMemberSchema,
} from "@/features/teams/team.validation";
import { asyncHandler } from "@/shared/utils/async-handler";

function resolveMerchantScope(request: Request, fallback?: string) {
  return request.platformAuthUser?.merchantId ?? fallback;
}

export const createTeamMemberController = asyncHandler(
  async (request: Request, response: Response) => {
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = createTeamMemberSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor,
    });
    const member = await createTeamMember(input);

    response.status(201).json({
      success: true,
      message: "Team member created.",
      data: member,
    });
  }
);

export const listTeamMembersController = asyncHandler(
  async (request: Request, response: Response) => {
    const query = listTeamMembersQuerySchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
    });
    const members = await listTeamMembers(query);

    response.status(200).json({
      success: true,
      data: members.items,
      ...(members.pagination ? { pagination: members.pagination } : {}),
    });
  }
);

export const getTeamMemberController = asyncHandler(
  async (request: Request, response: Response) => {
    const actionInput = teamMemberActionSchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
    });
    const member = await getTeamMemberById(
      String(request.params.teamMemberId),
      actionInput.merchantId
    );

    response.status(200).json({
      success: true,
      data: member,
    });
  }
);

export const updateTeamMemberController = asyncHandler(
  async (request: Request, response: Response) => {
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const actionInput = teamMemberActionSchema.parse({
      ...request.query,
      merchantId: resolveMerchantScope(
        request,
        typeof request.query.merchantId === "string"
          ? request.query.merchantId
          : undefined
      ),
      actor,
    });
    const input = updateTeamMemberSchema.parse({
      ...request.body,
      actor,
    });
    const member = await updateTeamMember(
      String(request.params.teamMemberId),
      actionInput.merchantId,
      input,
      request.platformAuthUser?.teamMemberId ?? null
    );

    response.status(200).json({
      success: true,
      message: "Team member updated.",
      data: member,
    });
  }
);

export const syncTeamMemberRoleController = asyncHandler(
  async (request: Request, response: Response) => {
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = teamMemberActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor,
    });
    const member = await syncTeamMemberRoleDefaults(
      String(request.params.teamMemberId),
      input
    );

    response.status(200).json({
      success: true,
      message: "Role defaults synced.",
      data: member,
    });
  }
);

export const resendTeamInviteController = asyncHandler(
  async (request: Request, response: Response) => {
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = teamMemberActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor,
    });
    const member = await resendTeamInvite(
      String(request.params.teamMemberId),
      input
    );

    response.status(200).json({
      success: true,
      message: "Invite resent.",
      data: member,
    });
  }
);

export const revokeTeamInviteController = asyncHandler(
  async (request: Request, response: Response) => {
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = teamMemberActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor,
    });
    const member = await revokeTeamInvite(
      String(request.params.teamMemberId),
      input
    );

    response.status(200).json({
      success: true,
      message: "Invite revoked.",
      data: member,
    });
  }
);

export const deleteTeamMemberController = asyncHandler(
  async (request: Request, response: Response) => {
    const actor =
      request.platformAuthUser?.name ?? request.platformAuthUser?.email ?? "system";
    const input = teamMemberActionSchema.parse({
      ...request.body,
      merchantId: resolveMerchantScope(request, request.body?.merchantId),
      actor,
    });
    const result = await deleteTeamMember(
      String(request.params.teamMemberId),
      input
    );

    response.status(200).json({
      success: true,
      message: "Team member removed.",
      data: result,
    });
  }
);
