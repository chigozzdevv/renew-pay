"use client";

import { useEffect, useMemo, useState } from "react";

import { MarketMultiSelect } from "@/components/dashboard/market-controls";
import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  formatDateTime,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  MetricCard,
  Modal,
  PaginationControls,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import { loadBillingMarketCatalog } from "@/lib/markets";
import {
  createTeamMember,
  deleteTeamMember,
  loadTeamMembersPage,
  resendInvite,
  revokeInvite,
  syncRoleDefaults,
  updateTeamMember,
  type TeamMemberRecord,
  type TeamRole,
} from "@/lib/teams";

type TeamStatusFilter = TeamMemberRecord["status"] | "all";
type TeamRoleFilter = TeamRole | "all";

type InviteDraft = {
  name: string;
  email: string;
  role: TeamRole;
  markets: string[];
};

type ManageDraft = {
  role: TeamRole;
  status: TeamMemberRecord["status"];
  markets: string[];
};

const roleOptions: TeamRole[] = [
  "owner",
  "admin",
  "operations",
  "finance",
  "developer",
  "support",
];

function createInviteDraft(defaultMarkets: string[] = []): InviteDraft {
  return {
    name: "",
    email: "",
    role: "support",
    markets: defaultMarkets,
  };
}

function createManageDraft(member: TeamMemberRecord): ManageDraft {
  return {
    role: member.role,
    status: member.status,
    markets: [...member.markets],
  };
}

export default function TeamsPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [status, setStatus] = useState<TeamStatusFilter>("all");
  const [role, setRole] = useState<TeamRoleFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [manageMember, setManageMember] = useState<TeamMemberRecord | null>(null);
  const [manageDraft, setManageDraft] = useState<ManageDraft | null>(null);
  const [removeMember, setRemoveMember] = useState<TeamMemberRecord | null>(null);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(createInviteDraft());

  const pageSize = 20;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadTeamMembersPage({
        token,
        merchantId,
        role,
        status,
        search,
        page,
        limit: pageSize,
      }),
    [page, role, search, status]
  );
  const { data: marketCatalog } = useResource(
    async ({ token, merchantId }) =>
      loadBillingMarketCatalog({
        token,
        merchantId,
        environment: mode,
      }),
    [mode]
  );

  const members = data?.members ?? [];
  const pagination = data?.pagination ?? {
    page,
    limit: pageSize,
    total: members.length,
    totalPages: 1,
  };
  const supportedMarkets =
    marketCatalog?.markets.filter((market) =>
      marketCatalog.merchantSupportedMarkets.includes(market.currency)
    ) ?? [];

  useEffect(() => {
    if (!message && !errorMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  useEffect(() => {
    setPage(1);
  }, [role, search, status]);

  useEffect(() => {
    if (!marketCatalog?.merchantSupportedMarkets.length) {
      return;
    }

    setInviteDraft((current) =>
      current.markets.length > 0
        ? current
        : { ...current, markets: marketCatalog.merchantSupportedMarkets }
    );
  }, [marketCatalog]);

  const metrics = useMemo(
    () => ({
      total: pagination.total,
      active: members.filter((member) => member.status === "active").length,
      invited: members.filter((member) => member.status === "invited").length,
      treasury: members.filter((member) => member.permissions.includes("treasury")).length,
    }),
    [members, pagination.total]
  );

  async function runAction(key: string, runner: () => Promise<void>) {
    setIsBusy(key);
    setMessage(null);
    setErrorMessage(null);

    try {
      await runner();
      await reload();
    } catch (actionError) {
      setErrorMessage(toErrorMessage(actionError));
    } finally {
      setIsBusy(null);
    }
  }

  function openInviteModal() {
    setInviteDraft(createInviteDraft(marketCatalog?.merchantSupportedMarkets ?? []));
    setShowInvite(true);
  }

  function openManageModal(member: TeamMemberRecord) {
    setManageMember(member);
    setManageDraft(createManageDraft(member));
  }

  async function handleInvite() {
    if (!token || !user?.merchantId) {
      return;
    }

    await runAction("invite-member", async () => {
      await createTeamMember({
        token,
        merchantId: user.merchantId,
        name: inviteDraft.name.trim(),
        email: inviteDraft.email.trim(),
        role: inviteDraft.role,
        markets: inviteDraft.markets,
      });
      setShowInvite(false);
      setInviteDraft(createInviteDraft(marketCatalog?.merchantSupportedMarkets ?? []));
      setMessage("Invite sent.");
    });
  }

  async function handleSaveMember() {
    if (!token || !manageMember || !manageDraft) {
      return;
    }

    await runAction(`save-member:${manageMember.id}`, async () => {
      await updateTeamMember({
        token,
        merchantId: manageMember.merchantId,
        teamMemberId: manageMember.id,
        payload: {
          role: manageDraft.role,
          status: manageDraft.status,
          markets: manageDraft.markets,
        },
      });
      setManageMember(null);
      setManageDraft(null);
      setMessage("Member updated.");
    });
  }

  async function handleSyncRole(member: TeamMemberRecord) {
    if (!token) {
      return;
    }

    await runAction(`sync-role:${member.id}`, async () => {
      await syncRoleDefaults({
        token,
        merchantId: member.merchantId,
        teamMemberId: member.id,
      });
      setMessage("Role defaults synced.");
    });
  }

  async function handleResendInvite(member: TeamMemberRecord) {
    if (!token) {
      return;
    }

    await runAction(`resend-invite:${member.id}`, async () => {
      await resendInvite({
        token,
        merchantId: member.merchantId,
        teamMemberId: member.id,
      });
      setMessage("Invite resent.");
    });
  }

  async function handleRevokeInvite(member: TeamMemberRecord) {
    if (!token) {
      return;
    }

    await runAction(`revoke-invite:${member.id}`, async () => {
      await revokeInvite({
        token,
        merchantId: member.merchantId,
        teamMemberId: member.id,
      });
      setManageMember(null);
      setManageDraft(null);
      setMessage("Invite revoked.");
    });
  }

  async function handleDeleteMember(member: TeamMemberRecord) {
    if (!token) {
      return;
    }

    await runAction(`delete-member:${member.id}`, async () => {
      await deleteTeamMember({
        token,
        merchantId: member.merchantId,
        teamMemberId: member.id,
      });
      setRemoveMember(null);
      setManageMember(null);
      setManageDraft(null);
      setMessage("Member removed.");
    });
  }

  if (isLoading && !data) {
    return <LoadingState />;
  }

  if (error || !data) {
    return (
      <PageState
        title="Teams unavailable"
        message={error ?? "Unable to load team data."}
        tone="danger"
        action={
          <button className="text-sm font-semibold" onClick={() => void reload()}>
            Retry
          </button>
        }
      />
    );
  }

  const canInvite =
    inviteDraft.name.trim().length > 1 &&
    inviteDraft.email.trim().length > 3 &&
    inviteDraft.markets.length > 0;
  const canSaveMember = !!manageDraft && manageDraft.markets.length > 0;

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard
          label="Members"
          value={String(metrics.total)}
          note="Workspace access records"
        />
        <MetricCard label="Active" value={String(metrics.active)} note="Visible page" />
        <MetricCard label="Invited" value={String(metrics.invited)} note="Visible page" />
        <MetricCard label="Treasury" value={String(metrics.treasury)} note="Visible page" />
      </StatGrid>

      <Card
        title="Teams"
        action={<Button tone="brand" onClick={openInviteModal}>Invite member</Button>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              value={role}
              onChange={(event) => {
                setRole(event.target.value as TeamRoleFilter);
                setPage(1);
              }}
            >
              <option value="all">All roles</option>
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as TeamStatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="suspended">Suspended</option>
            </Select>
            <Input
              placeholder="Search by name or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          {message ? <p className="text-sm text-[color:var(--brand)]">{message}</p> : null}
          {errorMessage ? <p className="text-sm text-[#a8382b]">{errorMessage}</p> : null}

          <Table columns={["Member", "Role", "Access", "Last active", "Actions"]}>
            {members.map((member) => (
              <TableRow key={member.id} columns={5}>
                <button
                  type="button"
                  className="text-left outline-none"
                  onClick={() => openManageModal(member)}
                >
                  <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    {member.name}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{member.email}</p>
                </button>
                <p className="self-center text-sm text-[color:var(--muted)]">{member.role}</p>
                <p className="self-center text-sm text-[color:var(--muted)]">{member.access}</p>
                <p className="self-center text-sm text-[color:var(--muted)]">
                  {formatDateTime(member.lastActiveAt ?? member.inviteSentAt)}
                </p>
                <div className="flex flex-wrap items-center gap-2 self-center">
                  <StatusBadge value={member.status} />
                  <button
                    type="button"
                    onClick={() => openManageModal(member)}
                    className="rounded-xl border border-[#111111] bg-[#111111] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#333333]"
                  >
                    Manage
                  </button>
                </div>
              </TableRow>
            ))}
          </Table>

          <PaginationControls
            page={pagination.page}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
          />
        </div>
      </Card>

      <Modal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite team member"
        description="Set the role and market access before the invite email goes out."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button
              tone="brand"
              disabled={isBusy === "invite-member" || !canInvite}
              onClick={() => void handleInvite()}
            >
              {isBusy === "invite-member" ? "Sending..." : "Send invite"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Name</label>
            <Input
              placeholder="Ada Okoye"
              value={inviteDraft.name}
              onChange={(event) =>
                setInviteDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Email</label>
            <Input
              placeholder="ops@renew.sh"
              value={inviteDraft.email}
              onChange={(event) =>
                setInviteDraft((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">Role</label>
            <Select
              value={inviteDraft.role}
              onChange={(event) =>
                setInviteDraft((current) => ({
                  ...current,
                  role: event.target.value as TeamRole,
                }))
              }
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Market access
            </label>
            <MarketMultiSelect
              options={supportedMarkets}
              value={inviteDraft.markets}
              onChange={(markets) =>
                setInviteDraft((current) => ({
                  ...current,
                  markets,
                }))
              }
              allLabel="All merchant markets"
              placeholder="Select market access"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!manageMember && !!manageDraft}
        onClose={() => {
          setManageMember(null);
          setManageDraft(null);
        }}
        title={manageMember?.name ?? "Member profile"}
        description={manageMember?.email}
        size="lg"
        footer={
          manageMember ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={isBusy === `sync-role:${manageMember.id}`}
                  onClick={() => void handleSyncRole(manageMember)}
                >
                  Sync role
                </Button>
                {manageMember.status === "invited" ? (
                  <>
                    <Button
                      disabled={isBusy === `resend-invite:${manageMember.id}`}
                      onClick={() => void handleResendInvite(manageMember)}
                    >
                      Resend invite
                    </Button>
                    <Button
                      tone="danger"
                      disabled={isBusy === `revoke-invite:${manageMember.id}`}
                      onClick={() => void handleRevokeInvite(manageMember)}
                    >
                      Revoke invite
                    </Button>
                  </>
                ) : null}
                {manageMember.role !== "owner" ? (
                  <Button tone="danger" onClick={() => setRemoveMember(manageMember)}>
                    Remove member
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    setManageMember(null);
                    setManageDraft(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  tone="brand"
                  disabled={
                    !canSaveMember || isBusy === `save-member:${manageMember.id}`
                  }
                  onClick={() => void handleSaveMember()}
                >
                  {isBusy === `save-member:${manageMember.id}` ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {manageMember && manageDraft ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Access" value={manageMember.access} />
              <Field label="Status" value={<StatusBadge value={manageMember.status} />} />
              <Field label="Last active" value={formatDateTime(manageMember.lastActiveAt)} />
              <Field label="Invite sent" value={formatDateTime(manageMember.inviteSentAt)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[color:var(--muted)]">
                  Role
                </label>
                <Select
                  value={manageDraft.role}
                  onChange={(event) =>
                    setManageDraft((current) =>
                      current
                        ? {
                            ...current,
                            role: event.target.value as TeamRole,
                          }
                        : current
                    )
                  }
                >
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[color:var(--muted)]">
                  Status
                </label>
                <Select
                  value={manageDraft.status}
                  onChange={(event) =>
                    setManageDraft((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as TeamMemberRecord["status"],
                          }
                        : current
                    )
                  }
                >
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-semibold text-[color:var(--muted)]">
                  Market access
                </label>
                <MarketMultiSelect
                  options={supportedMarkets}
                  value={manageDraft.markets}
                  onChange={(markets) =>
                    setManageDraft((current) =>
                      current
                        ? {
                            ...current,
                            markets,
                          }
                        : current
                    )
                  }
                  allLabel="All merchant markets"
                  placeholder="Select market access"
                />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-[#faf9f5] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Permissions
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {manageMember.permissions.map((permission) => (
                  <StatusBadge key={permission} value="active">
                    {permission.replace(/_/g, " ")}
                  </StatusBadge>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!removeMember}
        onClose={() => setRemoveMember(null)}
        title="Remove member"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setRemoveMember(null)}>Cancel</Button>
            <Button
              tone="danger"
              disabled={!removeMember || isBusy === `delete-member:${removeMember.id}`}
              onClick={() => removeMember && void handleDeleteMember(removeMember)}
            >
              {removeMember && isBusy === `delete-member:${removeMember.id}`
                ? "Removing..."
                : "Remove member"}
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-7 text-[color:var(--muted)]">
          Remove{" "}
          <span className="font-semibold text-[color:var(--ink)]">{removeMember?.name}</span> from
          this workspace? Their access will be revoked immediately.
        </p>
      </Modal>
    </div>
  );
}
