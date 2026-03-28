import { createPublicKey, randomBytes, verify as verifySignature } from "crypto";

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
    operatorSmartAccountAddress?: string | null;
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
    operatorWalletAddress: merchant?.operatorSmartAccountAddress ?? null,
    onboardingStatus: merchant?.onboardingStatus ?? "workspace_active",
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

function toBase64UrlBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  return Buffer.from(`${normalized}${padding}`, "base64");
}

function parseJwt(token: string) {
  const segments = token.split(".");

  if (segments.length !== 3) {
    throw new HttpError(401, "Privy token is malformed.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = JSON.parse(toBase64UrlBuffer(encodedHeader).toString("utf8")) as Record<
    string,
    unknown
  >;
  const payload = JSON.parse(toBase64UrlBuffer(encodedPayload).toString("utf8")) as Record<
    string,
    unknown
  >;
  const signature = toBase64UrlBuffer(encodedSignature);
  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");

  return {
    header,
    payload,
    signature,
    signingInput,
  };
}

function normalizePrivyVerificationKey() {
  const value = env.PRIVY_VERIFICATION_KEY.trim();

  if (!value) {
    throw new HttpError(
      503,
      "Privy verification is not configured. Set PRIVY_VERIFICATION_KEY to enable passkey auth."
    );
  }

  return value.replace(/\\n/g, "\n");
}

function verifyPrivyJwt(token: string) {
  const parsed = parseJwt(token);
  const algorithm = typeof parsed.header.alg === "string" ? parsed.header.alg : null;

  if (algorithm !== "ES256") {
    throw new HttpError(401, "Privy token algorithm is not supported.");
  }

  const publicKey = createPublicKey(normalizePrivyVerificationKey());
  const isValid = verifySignature(
    "sha256",
    parsed.signingInput,
    {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    },
    parsed.signature
  );

  if (!isValid) {
    throw new HttpError(401, "Privy token verification failed.");
  }

  const expiresAt = typeof parsed.payload.exp === "number" ? parsed.payload.exp : null;

  if (expiresAt && expiresAt * 1000 <= Date.now()) {
    throw new HttpError(401, "Privy token has expired.");
  }

  const appId = env.PRIVY_APP_ID.trim();

  if (!appId) {
    throw new HttpError(503, "Privy app ID is not configured. Set PRIVY_APP_ID to enable passkey auth.");
  }

  const audience = parsed.payload.aud;
  const audiences = Array.isArray(audience)
    ? audience.filter((entry): entry is string => typeof entry === "string")
    : typeof audience === "string"
      ? [audience]
      : [];

  if (!audiences.includes(appId)) {
    throw new HttpError(401, "Privy token audience does not match this app.");
  }

  return parsed.payload;
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
  const emailAccount = linkedAccounts.find((entry) => {
    const type = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
    return type === "email";
  });
  const address = emailAccount?.address;

  return typeof address === "string" && address.trim()
    ? address.trim().toLowerCase()
    : null;
}

async function resolveMerchantSessionMeta(merchantId: string) {
  const merchant = await MerchantModel.findById(merchantId)
    .select({
      authProvider: 1,
      operatorSmartAccountAddress: 1,
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
    operatorSmartAccountAddress: null,
    onboardingStatus: "identity_complete",
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
  const authClaims = verifyPrivyJwt(input.authToken);
  const identityClaims = input.identityToken ? verifyPrivyJwt(input.identityToken) : null;
  const providerUserId =
    typeof authClaims.sub === "string" && authClaims.sub.trim()
      ? authClaims.sub.trim()
      : typeof identityClaims?.sub === "string" && identityClaims.sub.trim()
        ? identityClaims.sub.trim()
        : null;

  if (!providerUserId) {
    throw new HttpError(401, "Privy session is missing a subject.");
  }

  let member = await TeamMemberModel.findOne({
    authProvider: "privy",
    authProviderUserId: providerUserId,
  }).exec();

  if (!member) {
    const resolvedEmail =
      extractEmailFromIdentityClaims(identityClaims ?? {}) ??
      input.email?.trim().toLowerCase() ??
      null;
    const resolvedName =
      (typeof identityClaims?.name === "string" ? identityClaims.name.trim() : null) ??
      input.name?.trim() ??
      null;

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
        operatorSmartAccountAddress:
          normalizeSolanaAddress(input.operatorWalletAddress),
        onboardingStatus: "identity_complete",
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

    if (!merchant.operatorSmartAccountAddress) {
      await MerchantModel.findByIdAndUpdate(member.merchantId, {
        operatorSmartAccountAddress: normalizedAddress,
        merchantAccount: normalizedAddress,
      }).exec();
      merchant.operatorSmartAccountAddress = normalizedAddress;
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
