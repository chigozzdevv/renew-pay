import { randomBytes } from "crypto";

import { PrivyClient } from "@privy-io/node";

import { env } from "@/config/env.config";
import { MerchantModel } from "@/features/merchants/merchant.model";
import { TeamMemberModel } from "@/features/teams/team.model";
import type {
  ActivateInviteInput,
  AuthTokenPayload,
  LoginInput,
  PrivySessionInput,
  SignupInput,
} from "@/features/auth/auth.validation";
import { appendAuditLog } from "@/features/audit/audit.service";
import { HttpError } from "@/shared/errors/http-error";
import {
  createUnconfiguredWalletAddress,
  normalizeSolanaAddress,
} from "@/shared/constants/solana";
import { createPasswordHash, verifyPasswordHash } from "@/shared/utils/password-hash";
import { signJwt } from "@/shared/utils/jwt";
import { getPermissionsForRole, normalizePermissions } from "@/shared/constants/team-rbac";

function toAuthenticatedUser(
  document: {
  _id: { toString(): string };
  merchantId: { toString(): string };
  name: string;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  markets: string[];
  lastActiveAt?: Date | null;
},
  merchant?: {
    authProvider?: string | null;
    operatorWalletAddress?: string | null;
    onboardingStatus?: string | null;
    governanceEnabled?: boolean | null;
  }
) {
  return {
    teamMemberId: document._id.toString(),
    merchantId: document.merchantId.toString(),
    name: document.name,
    email: document.email,
    role: document.role,
    status: document.status,
    workspaceMode: "test" as const,
    permissions: normalizePermissions(document.permissions),
    markets: document.markets,
    lastActiveAt: document.lastActiveAt ?? null,
    authProvider: merchant?.authProvider ?? "privy",
    operatorWalletAddress: merchant?.operatorWalletAddress ?? null,
    onboardingStatus: merchant?.onboardingStatus ?? "business",
    governanceEnabled: true,
  };
}

function issueAccessToken(input: {
  teamMemberId: string;
  merchantId: string;
}) {
  const token = signJwt(
    {
      sub: input.teamMemberId,
      merchantId: input.merchantId,
    },
    {
      secret: env.PLATFORM_AUTH_JWT_SECRET,
      expiresInSeconds: env.PLATFORM_AUTH_TOKEN_TTL_SECONDS,
    }
  );

  return {
    accessToken: token,
    expiresInSeconds: env.PLATFORM_AUTH_TOKEN_TTL_SECONDS,
  };
}

function createUnconfiguredAddress() {
  return createUnconfiguredWalletAddress();
}


function getPrivyClient() {
  const appId = env.PRIVY_APP_ID.trim();
  const appSecret = env.PRIVY_APP_SECRET.trim();

  if (!appId || !appSecret) {
    throw new HttpError(
      503,
      "Privy is not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET to enable passkey auth."
    );
  }

  return new PrivyClient({ appId, appSecret });
}

async function verifyPrivyJwt(token: string) {
  const privy = getPrivyClient();

  try {
    return await privy.utils().auth().verifyAccessToken(token);
  } catch {
    throw new HttpError(401, "Privy token verification failed.");
  }
}

function toRecordArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === "object" && entry !== null
          )
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function extractEmailFromIdentityClaims(claims: Record<string, unknown>) {
  if (typeof claims.email === "string" && claims.email.trim()) {
    return claims.email.trim().toLowerCase();
  }

  const linkedAccounts = toRecordArray(claims.linked_accounts);

  for (const account of linkedAccounts) {
    const address =
      typeof account.address === "string" && account.address.trim()
        ? account.address.trim().toLowerCase()
        : null;
    if (address) {
      return address;
    }

    const email =
      typeof account.email === "string" && account.email.trim()
        ? account.email.trim().toLowerCase()
        : null;
    if (email) {
      return email;
    }
  }

  return null;
}

async function resolvePrivyEmail(input: {
  providerUserId: string;
  identityClaims?: Record<string, unknown> | null;
  fallbackEmail?: string | null;
}) {
  const emailFromIdentity =
    input.identityClaims ? extractEmailFromIdentityClaims(input.identityClaims) : null;

  if (emailFromIdentity) {
    return emailFromIdentity;
  }

  const normalizedFallback = input.fallbackEmail?.trim().toLowerCase() ?? null;
  if (normalizedFallback) {
    return normalizedFallback;
  }

  try {
    const privyUser = await getPrivyClient().users()._get(input.providerUserId);
    return extractEmailFromIdentityClaims(privyUser as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function resolveMerchantSessionMeta(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId)
    .select({
      authProvider: 1,
      operatorWalletAddress: 1,
      onboardingStatus: 1,
      governanceEnabled: 1,
    })
    .lean()
    .exec();

  if (!merchant) {
    throw new HttpError(404, "Merchant was not found.");
  }

  return merchant;
}

export async function signupWithPassword(input: SignupInput) {
  const existingMember = await TeamMemberModel.findOne({
    email: input.email,
  }).exec();

  if (existingMember) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const now = new Date();
  const password = createPasswordHash(
    input.password,
    env.PLATFORM_AUTH_PASSWORD_ITERATIONS
  );
  const merchantAccount = `merchant:${randomBytes(16).toString("hex")}`;
  const payoutWallet = createUnconfiguredAddress();

  const merchant = await MerchantModel.create({
    merchantAccount,
    payoutWallet,
    reserveWallet: null,
    name: input.company,
    supportEmail: input.email,
    billingTimezone: input.billingTimezone,
    supportedMarkets: input.supportedMarkets,
    metadataHash: "0x0",
    status: "active",
    authProvider: "password",
    authProviderUserId: null,
    operatorWalletAddress: null,
    onboardingStatus: "business",
    governanceEnabled: true,
  });

  try {
    const permissions = getPermissionsForRole("owner");
    const createdMember = await TeamMemberModel.create({
      merchantId: merchant._id,
      name: input.name,
      email: input.email,
      role: "owner",
      status: "active",
      markets: input.supportedMarkets,
      permissions,
      inviteToken: null,
      inviteSentAt: null,
      lastActiveAt: now,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      passwordUpdatedAt: now,
      authProvider: "password",
      authProviderUserId: null,
    });

    await appendAuditLog({
      merchantId: merchant._id.toString(),
      actor: input.name,
      action: "Created workspace",
      category: "workspace",
      status: "ok",
      target: input.email,
      detail: `${input.name} created ${input.company}.`,
      metadata: {
        role: "owner",
        supportedMarkets: input.supportedMarkets,
      },
      ipAddress: null,
      userAgent: null,
    }).catch(() => undefined);

    const user = toAuthenticatedUser(createdMember, merchant);

    return {
      ...issueAccessToken({
        teamMemberId: user.teamMemberId,
        merchantId: user.merchantId,
      }),
      user,
    };
  } catch (error) {
    await MerchantModel.deleteOne({ _id: merchant._id }).catch(() => undefined);
    throw error;
  }
}

export async function authenticateWithPassword(input: LoginInput) {
  const member = input.merchantId
    ? await TeamMemberModel.findOne({
        merchantId: input.merchantId,
        email: input.email,
      }).exec()
    : await resolveLoginMemberByEmail(input.email);

  if (!member) {
    throw new HttpError(401, "Invalid email or password.");
  }

  if (member.status !== "active") {
    throw new HttpError(403, "Team member is not active.");
  }

  if (!member.passwordHash || !member.passwordSalt) {
    throw new HttpError(403, "Password has not been set for this team member.");
  }

  const isPasswordValid = verifyPasswordHash({
    password: input.password,
    salt: member.passwordSalt,
    expectedHash: member.passwordHash,
    iterations: env.PLATFORM_AUTH_PASSWORD_ITERATIONS,
  });

  if (!isPasswordValid) {
    throw new HttpError(401, "Invalid email or password.");
  }

  member.lastActiveAt = new Date();
  await member.save();

  const merchant = await resolveMerchantSessionMeta(member.merchantId.toString());
  const user = toAuthenticatedUser(member, merchant);

  return {
    ...issueAccessToken({
      teamMemberId: user.teamMemberId,
      merchantId: user.merchantId,
    }),
    user,
  };
}

async function resolveLoginMemberByEmail(email: string) {
  const members = await TeamMemberModel.find({
    email,
  })
    .sort({ createdAt: 1 })
    .exec();

  if (members.length === 0) {
    return null;
  }

  if (members.length > 1) {
    throw new HttpError(
      409,
      "This email belongs to multiple workspaces. Use your invite link or ask your admin for the correct workspace."
    );
  }

  return members[0] ?? null;
}

export async function activateInvite(input: ActivateInviteInput) {
  const member = await TeamMemberModel.findOne({
    merchantId: input.merchantId,
    inviteToken: input.inviteToken,
  }).exec();

  if (!member) {
    throw new HttpError(404, "Invite token was not found.");
  }

  if (member.status !== "invited") {
    throw new HttpError(409, "Invite is no longer valid.");
  }

  const password = createPasswordHash(
    input.password,
    env.PLATFORM_AUTH_PASSWORD_ITERATIONS
  );

  member.passwordHash = password.hash;
  member.passwordSalt = password.salt;
  member.passwordUpdatedAt = new Date();
  member.status = "active";
  member.inviteToken = null;
  member.lastActiveAt = new Date();
  member.authProvider = member.authProvider ?? "password";
  await member.save();

  const merchant = await resolveMerchantSessionMeta(member.merchantId.toString());
  const user = toAuthenticatedUser(member, merchant);

  return {
    ...issueAccessToken({
      teamMemberId: user.teamMemberId,
      merchantId: user.merchantId,
    }),
    user,
  };
}

export async function getAuthenticatedUser(input: AuthTokenPayload) {
  const member = await TeamMemberModel.findOne({
    _id: input.sub,
    merchantId: input.merchantId,
  }).exec();

  if (!member || member.status !== "active") {
    throw new HttpError(401, "Authenticated team member is not active.");
  }

  const merchant = await resolveMerchantSessionMeta(member.merchantId.toString());

  return toAuthenticatedUser(member, merchant);
}

export async function exchangePrivySession(input: PrivySessionInput) {
  const authClaims = await verifyPrivyJwt(input.authToken);
  const identityClaims = input.identityToken
    ? await getPrivyClient().utils().auth().verifyIdentityToken(input.identityToken)
    : null;
  const providerUserId = authClaims.user_id?.trim() || null;

  if (!providerUserId) {
    throw new HttpError(401, "Privy session is missing a subject.");
  }

  let member = await TeamMemberModel.findOne({
    authProvider: "privy",
    authProviderUserId: providerUserId,
  }).exec();

  if (!member) {
    const resolvedEmail = await resolvePrivyEmail({
      providerUserId,
      identityClaims: identityClaims as Record<string, unknown> | null,
      fallbackEmail: input.email ?? null,
    });
    const resolvedName = input.name?.trim() ?? null;

    if (!resolvedEmail) {
      throw new HttpError(409, "Privy session is missing an email address.");
    }

    const linkableMembers = await TeamMemberModel.find({
      email: resolvedEmail,
      status: { $in: ["active", "invited"] },
      authProviderUserId: null,
    })
      .sort({ createdAt: 1 })
      .exec();

    if (linkableMembers.length > 1) {
      throw new HttpError(
        409,
        "This email belongs to multiple workspaces. Complete the session exchange with a specific owner account."
      );
    }

    if (linkableMembers.length === 1 && linkableMembers[0]) {
      member = linkableMembers[0];
      if (member.status === "invited") {
        member.status = "active";
        member.inviteToken = null;
        member.inviteSentAt = null;
      }
      member.authProvider = "privy";
      member.authProviderUserId = providerUserId;
      member.lastActiveAt = new Date();
      member.passwordHash = null;
      member.passwordSalt = null;
      member.passwordUpdatedAt = null;
      await member.save();

      if (member.role === "owner") {
        await MerchantModel.findByIdAndUpdate(member.merchantId, {
          authProvider: "privy",
          authProviderUserId: providerUserId,
        }).exec();
      }
    } else {
      if (!resolvedName || !input.company?.trim()) {
        throw new HttpError(
          409,
          "Name and company are required the first time a Privy account creates a workspace."
        );
      }

      const merchant = await MerchantModel.create({
        merchantAccount:
          normalizeSolanaAddress(input.operatorWalletAddress) ??
          `merchant:${randomBytes(16).toString("hex")}`,
        payoutWallet: createUnconfiguredAddress(),
        reserveWallet: null,
        name: input.company.trim(),
        supportEmail: resolvedEmail,
        billingTimezone: input.billingTimezone,
        supportedMarkets: input.supportedMarkets,
        metadataHash: "0x0",
        status: "active",
        authProvider: "privy",
        authProviderUserId: providerUserId,
        operatorWalletAddress:
          normalizeSolanaAddress(input.operatorWalletAddress),
        onboardingStatus: "business",
        governanceEnabled: true,
      });

      const permissions = getPermissionsForRole("owner");
      member = await TeamMemberModel.create({
        merchantId: merchant._id,
        name: resolvedName,
        email: resolvedEmail,
        role: "owner",
        status: "active",
        markets: input.supportedMarkets,
        permissions,
        inviteToken: null,
        inviteSentAt: null,
        lastActiveAt: new Date(),
        passwordHash: null,
        passwordSalt: null,
        passwordUpdatedAt: null,
        authProvider: "privy",
        authProviderUserId: providerUserId,
      });

      await appendAuditLog({
        merchantId: merchant._id.toString(),
        actor: resolvedName,
        action: "Created workspace",
        category: "workspace",
        status: "ok",
        target: resolvedEmail,
        detail: `${resolvedName} created ${merchant.name} with Privy.`,
        metadata: {
          role: "owner",
          authProvider: "privy",
          supportedMarkets: input.supportedMarkets,
        },
        ipAddress: null,
        userAgent: null,
      }).catch(() => undefined);
    }
  }

  if (!member) {
    throw new HttpError(401, "Unable to resolve a team member for this Privy session.");
  }

  member.lastActiveAt = new Date();
  await member.save();

  const merchant = await resolveMerchantSessionMeta(member.merchantId.toString());

  if (input.operatorWalletAddress) {
    const normalizedAddress = normalizeSolanaAddress(input.operatorWalletAddress);

    if (!normalizedAddress) {
      throw new HttpError(400, "Operator wallet address is invalid.");
    }

    if (!merchant.operatorWalletAddress) {
      await MerchantModel.findByIdAndUpdate(member.merchantId, {
        operatorWalletAddress: normalizedAddress,
        merchantAccount: normalizedAddress,
      }).exec();
      merchant.operatorWalletAddress = normalizedAddress;
    }
  }

  const user = toAuthenticatedUser(member, merchant);

  return {
    ...issueAccessToken({
      teamMemberId: user.teamMemberId,
      merchantId: user.merchantId,
    }),
    user,
  };
}
