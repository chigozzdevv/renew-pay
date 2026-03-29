import { randomUUID } from "crypto";

import { HttpError } from "@/shared/errors/http-error";
import {
  describeAccessFromPermissions,
  getPermissionsForRole,
  normalizePermissions,
  type TeamRole,
} from "@/shared/constants/team-rbac";

import { appendAuditLog } from "@/features/audit/audit.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { queueTeamInviteNotification } from "@/features/notifications/notification.service";
import { TeamMemberModel } from "@/features/teams/team.model";
import { TreasurySignerModel } from "@/features/treasury/treasury-signer.model";
import {
  assertTeamMemberCanLeaveOwnerRole,
  syncOwnerTreasuryGovernance,
} from "@/features/treasury/treasury.service";
import type {
  CreateTeamMemberInput,
  ListTeamMembersQuery,
  TeamMemberActionInput,
  UpdateTeamMemberInput,
} from "@/features/teams/team.validation";
import {
  buildPagination,
  resolvePagination,
  type ListResult,
} from "@/shared/utils/pagination";

function toTeamMemberResponse(document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  name?: string | null;
  email: string;
  role: string;
  status: string;
  markets: string[];
  permissions: string[];
  lastActiveAt?: Date | null;
  inviteSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const permissions = normalizePermissions(document.permissions);
  const displayName = document.name?.trim() || document.email;

  return {
    id: document._id.toString(),
    merchantId: document.merchantId.toString(),
    name: displayName,
    email: document.email,
    role: document.role,
    status: document.status,
    markets: document.markets,
    permissions,
    access: describeAccessFromPermissions(permissions),
    lastActiveAt: document.lastActiveAt ?? null,
    inviteSentAt: document.inviteSentAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function ensureMerchant(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

async function ensureTeamMember(teamMemberId: string, merchantId: string) {
  const teamMember = await TeamMemberModel.findOne({
    _id: teamMemberId,
    merchantId,
  }).exec();

  if (!teamMember) {
    throw new HttpError(404, "Team member was not found.");
  }

  return teamMember;
}

export async function createTeamMember(input: CreateTeamMemberInput) {
  const merchant = await ensureMerchant(input.merchantId);

  const unsupportedMarkets = input.markets.filter(
    (market) => !merchant.supportedMarkets.includes(market)
  );

  if (unsupportedMarkets.length > 0) {
    throw new HttpError(
      409,
      `Team member markets must be selected from the merchant-supported catalog: ${unsupportedMarkets.join(", ")}.`
    );
  }

  const existingMember = await TeamMemberModel.findOne({
    merchantId: input.merchantId,
    email: input.email,
  }).exec();

  if (existingMember) {
    throw new HttpError(409, "A team member with this email already exists.");
  }

  if (input.status === "active") {
    throw new HttpError(
      409,
      "Direct active team member creation is disabled. Invite the teammate and let them continue with Privy."
    );
  }

  const role = input.role as TeamRole;
  const permissions =
    input.permissions && input.permissions.length > 0
      ? normalizePermissions(input.permissions)
      : getPermissionsForRole(role);
  const now = new Date();

  const createdMember = await TeamMemberModel.create({
    merchantId: input.merchantId,
    name: input.name,
    email: input.email,
    role,
    status: input.status,
    markets: input.markets,
    permissions,
    inviteToken: input.status === "invited" ? randomUUID() : null,
    inviteSentAt: input.status === "invited" ? now : null,
    lastActiveAt: null,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
  });

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Invited team member",
    category: "team",
    status: "ok",
    target: input.email,
    detail: `${input.name} added as ${role}.`,
    metadata: {
      role,
      status: input.status,
      permissions,
      markets: input.markets,
    },
    ipAddress: null,
    userAgent: null,
  });

  if (input.status === "invited") {
    await queueTeamInviteNotification({
      merchantId: input.merchantId,
      environment: "test",
      teamMemberId: createdMember._id.toString(),
      kind: "sent",
    }).catch(() => undefined);
  }

  return toTeamMemberResponse(createdMember);
}

export async function listTeamMembers(query: ListTeamMembersQuery) {
  await ensureMerchant(query.merchantId);

  const mongoQuery: Record<string, unknown> = {
    merchantId: query.merchantId,
  };

  if (query.role) {
    mongoQuery.role = query.role;
  }

  if (query.status) {
    mongoQuery.status = query.status;
  }

  if (query.search) {
    const pattern = new RegExp(query.search, "i");
    mongoQuery.$or = [{ name: pattern }, { email: pattern }];
  }

  const pagination = resolvePagination(query);

  if (!pagination) {
    const members = await TeamMemberModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .exec();

    return {
      items: members.map(toTeamMemberResponse),
    } satisfies ListResult<ReturnType<typeof toTeamMemberResponse>>;
  }

  const [total, members] = await Promise.all([
    TeamMemberModel.countDocuments(mongoQuery).exec(),
    TeamMemberModel.find(mongoQuery)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .exec(),
  ]);

  return {
    items: members.map(toTeamMemberResponse),
    pagination: buildPagination(pagination.page, pagination.limit, total),
  } satisfies ListResult<ReturnType<typeof toTeamMemberResponse>>;
}

export async function getTeamMemberById(teamMemberId: string, merchantId: string) {
  await ensureMerchant(merchantId);
  const member = await ensureTeamMember(teamMemberId, merchantId);

  return toTeamMemberResponse(member);
}

export async function updateTeamMember(
  teamMemberId: string,
  merchantId: string,
  input: UpdateTeamMemberInput,
  requesterTeamMemberId: string | null
) {
  const merchant = await ensureMerchant(merchantId);
  const member = await ensureTeamMember(teamMemberId, merchantId);
  const previousRole = member.role;
  const previousStatus = member.status;
  const nextRole = input.role ?? member.role;
  const nextStatus = input.status ?? member.status;
  const becameActiveOwner =
    previousRole !== "owner" && nextRole === "owner" && nextStatus === "active";

  if (
    previousRole === "owner" &&
    (nextRole !== "owner" || nextStatus !== "active")
  ) {
    await assertTeamMemberCanLeaveOwnerRole({
      merchantId,
      teamMemberId,
    });
  }

  if (becameActiveOwner) {
    const signerBinding = await TreasurySignerModel.findOne({
      merchantId,
      teamMemberId,
      status: "active",
    })
      .select({ _id: 1 })
      .lean()
      .exec();

    if (!signerBinding) {
      throw new HttpError(
        409,
        "This team member must verify their Privy Solana wallet as a treasury signer before becoming an owner."
      );
    }
  }

  if (input.name !== undefined) {
    member.name = input.name;
  }

  if (input.role !== undefined) {
    member.role = input.role;
  }

  if (input.status !== undefined) {
    if (member.status === "invited" && input.status === "active") {
      throw new HttpError(
        409,
        "Invited teammates must activate access by signing in with Privy."
      );
    }

    member.status = input.status;

    if (input.status === "active") {
      member.lastActiveAt = member.lastActiveAt ?? new Date();
      member.inviteToken = null;
    }
  }

  if (input.markets !== undefined) {
    const unsupportedMarkets = input.markets.filter(
      (market) => !merchant.supportedMarkets.includes(market)
    );

    if (unsupportedMarkets.length > 0) {
      throw new HttpError(
        409,
        `Team member markets must be selected from the merchant-supported catalog: ${unsupportedMarkets.join(", ")}.`
      );
    }
    member.markets = input.markets;
  }

  if (input.permissions !== undefined) {
    member.permissions = normalizePermissions(input.permissions);
  } else if (input.role !== undefined) {
    // Role change without explicit permission override resets to role defaults.
    member.permissions = getPermissionsForRole(input.role as TeamRole);
  }

  await member.save();

  if (becameActiveOwner) {
    if (!requesterTeamMemberId) {
      throw new HttpError(401, "Authenticated team member is required.");
    }

    await syncOwnerTreasuryGovernance({
      merchantId,
      teamMemberId: member._id.toString(),
      requesterTeamMemberId,
      actor: input.actor,
      requireVerifiedSigner: true,
    });
  }

  await appendAuditLog({
    merchantId,
    actor: input.actor,
    action: "Updated team member",
    category: "team",
    status: "ok",
    target: member.email,
    detail: `Updated access for ${member.name}.`,
    metadata: {
      role: member.role,
      status: member.status,
      permissions: member.permissions,
      markets: member.markets,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toTeamMemberResponse(member);
}

export async function syncTeamMemberRoleDefaults(
  teamMemberId: string,
  input: TeamMemberActionInput
) {
  await ensureMerchant(input.merchantId);
  const member = await ensureTeamMember(teamMemberId, input.merchantId);
  const role = member.role as TeamRole;

  member.permissions = getPermissionsForRole(role);
  await member.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Synced role defaults",
    category: "team",
    status: "ok",
    target: member.email,
    detail: `Permissions reset to ${role} defaults.`,
    metadata: {
      role,
      permissions: member.permissions,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toTeamMemberResponse(member);
}

export async function resendTeamInvite(
  teamMemberId: string,
  input: TeamMemberActionInput
) {
  await ensureMerchant(input.merchantId);
  const member = await ensureTeamMember(teamMemberId, input.merchantId);

  if (member.status !== "invited") {
    throw new HttpError(409, "Team member is not in invited state.");
  }

  member.inviteToken = randomUUID();
  member.inviteSentAt = new Date();
  await member.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Resent team invite",
    category: "team",
    status: "ok",
    target: member.email,
    detail: `Invitation resent to ${member.name}.`,
    metadata: {
      inviteSentAt: member.inviteSentAt,
    },
    ipAddress: null,
    userAgent: null,
  });

  return toTeamMemberResponse(member);
}

export async function revokeTeamInvite(
  teamMemberId: string,
  input: TeamMemberActionInput
) {
  await ensureMerchant(input.merchantId);
  const member = await ensureTeamMember(teamMemberId, input.merchantId);

  if (member.status !== "invited") {
    throw new HttpError(409, "Only invited members can be revoked.");
  }

  member.status = "suspended";
  member.inviteToken = null;
  member.inviteSentAt = null;
  await member.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Revoked team invite",
    category: "team",
    status: "warning",
    target: member.email,
    detail: `Invitation revoked for ${member.name}.`,
    metadata: {},
    ipAddress: null,
    userAgent: null,
  });

  return toTeamMemberResponse(member);
}

export async function deleteTeamMember(
  teamMemberId: string,
  input: TeamMemberActionInput
) {
  await ensureMerchant(input.merchantId);
  const member = await ensureTeamMember(teamMemberId, input.merchantId);

  if (member.role === "owner") {
    throw new HttpError(409, "Owner cannot be removed.");
  }

  await member.deleteOne();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Removed team member",
    category: "team",
    status: "warning",
    target: member.email,
    detail: `${member.name} was removed from workspace.`,
    metadata: {},
    ipAddress: null,
    userAgent: null,
  });

  return {
    id: member._id.toString(),
    removed: true,
  };
}
