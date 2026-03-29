import { appendAuditLog } from "@/features/audit/audit.service";
import type { EnableGovernanceInput } from "@/features/governance/governance.validation";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { queueGovernanceToggleNotification } from "@/features/notifications/notification.service";
import { TeamMemberModel } from "@/features/teams/team.model";
import { TreasuryAccountModel } from "@/features/treasury/treasury-account.model";
import { TreasurySignerModel } from "@/features/treasury/treasury-signer.model";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

async function getMerchantOrThrow(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId).exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

export async function getGovernanceState(
  merchantId: string,
  environment: RuntimeMode = "test"
) {
  const merchant = await getMerchantOrThrow(merchantId);
  const [signers, teamMembers, treasuryAccount] = await Promise.all([
    TreasurySignerModel.find({ merchantId })
      .sort({ createdAt: 1 })
      .lean()
      .exec(),
    TeamMemberModel.find({ merchantId })
      .sort({ createdAt: 1 })
      .lean()
      .exec(),
    TreasuryAccountModel.findOne({
      merchantId,
      environment,
    })
      .lean()
      .exec(),
  ]);

  const memberMap = new Map(teamMembers.map((member) => [member._id.toString(), member]));
  const activeOwners = teamMembers.filter(
    (member) => member.role === "owner" && member.status === "active"
  );
  const approvers = signers.map((signer) => {
    const member = memberMap.get(signer.teamMemberId.toString());

    return {
      id: signer._id.toString(),
      teamMemberId: signer.teamMemberId.toString(),
      walletAddress: signer.walletAddress,
      status: signer.status,
      verifiedAt: signer.verifiedAt ?? null,
      revokedAt: signer.revokedAt ?? null,
      role: member?.role ?? "support",
      name: member?.name ?? "Unknown team member",
      email: member?.email ?? null,
    };
  });

  const activeApprovers = approvers.filter((entry) => entry.status === "active");
  const threshold =
    treasuryAccount?.threshold ??
    (activeOwners.length <= 1 ? 1 : Math.min(2, activeOwners.length));

  return {
    merchantId,
    enabled: true,
    onboardingStatus: merchant.onboardingStatus,
    mode:
      activeOwners.length > 1
        ? ("multisig" as const)
        : ("single_owner" as const),
    controllerWalletAddress:
      treasuryAccount?.operatorVaultAddress ??
      treasuryAccount?.governanceVaultAddress ??
      merchant.operatorWalletAddress ??
      null,
    payoutWallet: merchant.payoutWallet,
    activeSignerCount: activeApprovers.length,
    threshold,
    approvers,
  };
}

export async function enableGovernance(input: {
  merchantId: string;
  actor: string;
  payload: EnableGovernanceInput;
}) {
  const merchant = await getMerchantOrThrow(input.merchantId);
  merchant.governanceEnabled = true;
  await merchant.save();

  await appendAuditLog({
    merchantId: input.merchantId,
    actor: input.actor,
    action: "Configured workspace approvals",
    category: "security",
    status: "ok",
    target: merchant.name ?? merchant.supportEmail ?? null,
    detail:
      "Workspace approvals stay enabled; multi-owner workspaces automatically use multisig.",
    metadata: {
      environment: input.payload.environment,
      enabled: true,
      requestedEnabled: input.payload.enabled,
    },
    ipAddress: null,
    userAgent: null,
  });

  await queueGovernanceToggleNotification({
    merchantId: input.merchantId,
    environment: input.payload.environment,
    enabled: true,
  }).catch(() => undefined);

  return getGovernanceState(input.merchantId, input.payload.environment);
}
