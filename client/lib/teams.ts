"use client";

import { fetchApi, type ApiPagination } from "@/lib/api";

export type TeamRole =
  | "owner"
  | "admin"
  | "operations"
  | "finance"
  | "developer"
  | "support";

export type TeamPermission =
  | "customers"
  | "plans"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "treasury"
  | "developers"
  | "team_admin";

export type TeamMemberRecord = {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "active" | "invited" | "suspended";
  markets: string[];
  permissions: TeamPermission[];
  access: string;
  lastActiveAt: string | null;
  inviteSentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamMemberPage = {
  members: TeamMemberRecord[];
  pagination: ApiPagination;
};

function resolvePagination(
  pagination: ApiPagination | undefined,
  page: number,
  limit: number,
  count: number
) {
  return (
    pagination ?? {
      page,
      limit,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    }
  );
}

export async function loadTeamMembers(input: {
  token: string;
  merchantId: string;
  role?: TeamRole | "all";
  status?: TeamMemberRecord["status"] | "all";
  search?: string;
}) {
  const response = await fetchApi<TeamMemberRecord[]>("/teams", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      role: input.role && input.role !== "all" ? input.role : undefined,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
    },
  });

  return response.data;
}

export async function loadTeamMembersPage(input: {
  token: string;
  merchantId: string;
  role?: TeamRole | "all";
  status?: TeamMemberRecord["status"] | "all";
  search?: string;
  page: number;
  limit?: number;
}) {
  const limit = input.limit ?? 20;
  const response = await fetchApi<TeamMemberRecord[]>("/teams", {
    token: input.token,
    query: {
      merchantId: input.merchantId,
      role: input.role && input.role !== "all" ? input.role : undefined,
      status: input.status && input.status !== "all" ? input.status : undefined,
      search: input.search?.trim() || undefined,
      page: input.page,
      limit,
    },
  });

  return {
    members: response.data,
    pagination: resolvePagination(response.pagination, input.page, limit, response.data.length),
  } satisfies TeamMemberPage;
}

export async function createTeamMember(input: {
  token: string;
  merchantId: string;
  name: string;
  email: string;
  role: TeamRole;
  markets: string[];
}) {
  const response = await fetchApi<TeamMemberRecord>("/teams", {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
      name: input.name,
      email: input.email,
      role: input.role,
      markets: input.markets,
      status: "invited",
    }),
  });

  return response.data;
}

export async function updateTeamMember(input: {
  token: string;
  merchantId: string;
  teamMemberId: string;
  payload: Partial<{
    role: TeamRole;
    status: TeamMemberRecord["status"];
    markets: string[];
    permissions: TeamPermission[];
  }>;
}) {
  const response = await fetchApi<TeamMemberRecord>(`/teams/${input.teamMemberId}`, {
    method: "PATCH",
    token: input.token,
    query: {
      merchantId: input.merchantId,
    },
    body: JSON.stringify(input.payload),
  });

  return response.data;
}

export async function syncRoleDefaults(input: {
  token: string;
  merchantId: string;
  teamMemberId: string;
}) {
  const response = await fetchApi<TeamMemberRecord>(`/teams/${input.teamMemberId}/sync-role`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
    }),
  });

  return response.data;
}

export async function resendInvite(input: {
  token: string;
  merchantId: string;
  teamMemberId: string;
}) {
  const response = await fetchApi<TeamMemberRecord>(`/teams/${input.teamMemberId}/resend-invite`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
    }),
  });

  return response.data;
}

export async function revokeInvite(input: {
  token: string;
  merchantId: string;
  teamMemberId: string;
}) {
  const response = await fetchApi<TeamMemberRecord>(`/teams/${input.teamMemberId}/revoke-invite`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      merchantId: input.merchantId,
    }),
  });

  return response.data;
}

export async function deleteTeamMember(input: {
  token: string;
  merchantId: string;
  teamMemberId: string;
}) {
  const response = await fetchApi<{ id: string; removed: boolean }>(
    `/teams/${input.teamMemberId}`,
    {
      method: "DELETE",
      token: input.token,
      body: JSON.stringify({
        merchantId: input.merchantId,
      }),
    }
  );

  return response.data;
}
