import { randomBytes } from "crypto";

import { PrivyClient } from "@privy-io/node";

import { env } from "@/config/env.config";
import { appendAuditLog } from "@/features/audit/audit.service";
import { MerchantModel } from "@/features/merchants/merchant.model";
import type {
  AuthTokenPayload,
  PrivySessionInput,
} from "@/features/auth/auth.validation";
import { getOwnerPermissions, normalizePermissions } from "@/shared/constants/access-control";
import {
  createUnconfiguredWalletAddress,
  normalizeEvmAddress,
} from "@/shared/constants/address";
import { HttpError } from "@/shared/errors/http-error";
import { signJwt } from "@/shared/utils/jwt";

function createUnconfiguredAddress() {
  return createUnconfiguredWalletAddress();
}

function toAuthenticatedUser(document: {
  _id: { toString(): string };
  ownerName?: string | null;
  name?: string | null;
  supportEmail?: string | null;
  status: string;
  supportedMarkets?: string[];
  authProvider?: string | null;
  operatorWalletAddress?: string | null;
  onboardingStatus?: string | null;
}) {
  const accountId = document._id.toString();
  const email = document.supportEmail?.trim().toLowerCase() ?? "";
  const displayName =
    document.ownerName?.trim() ||
    document.name?.trim() ||
    email ||
    "Merchant";

  return {
    accountId,
    teamMemberId: accountId,
    merchantId: accountId,
    name: displayName,
    email,
    role: "owner",
    status: document.status,
    workspaceMode: "test" as const,
    permissions: normalizePermissions(getOwnerPermissions()),
    markets: document.supportedMarkets ?? [],
    lastActiveAt: null,
    authProvider: document.authProvider ?? "privy",
    operatorWalletAddress: document.operatorWalletAddress ?? null,
    onboardingStatus: document.onboardingStatus ?? "business",
  };
}

function issueAccessToken(input: {
  accountId: string;
  merchantId: string;
}) {
  const token = signJwt(
    {
      sub: input.accountId,
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

async function verifyPrivyIdentityToken(token?: string | null) {
  if (!token?.trim()) {
    return null;
  }

  try {
    return (await getPrivyClient().utils().auth().verifyIdentityToken(token)) as unknown as Record<
      string,
      unknown
    >;
  } catch {
    return null;
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
    const email =
      typeof account.email === "string" && account.email.trim()
        ? account.email.trim().toLowerCase()
        : null;
    if (email) {
      return email;
    }

    const accountType =
      typeof account.type === "string" ? account.type.trim().toLowerCase() : null;
    const address =
      accountType === "email" &&
      typeof account.address === "string" &&
      account.address.trim()
        ? account.address.trim().toLowerCase()
        : null;
    if (address) {
      return address;
    }
  }

  return null;
}

function extractNameFromIdentityClaims(claims: Record<string, unknown>) {
  if (typeof claims.name === "string" && claims.name.trim()) {
    return claims.name.trim();
  }

  const linkedAccounts = toRecordArray(claims.linked_accounts);

  for (const account of linkedAccounts) {
    const name =
      typeof account.name === "string" && account.name.trim()
        ? account.name.trim()
        : null;
    if (name) {
      return name;
    }
  }

  return null;
}

async function resolvePrivyProfile(input: {
  providerUserId: string;
  identityClaims?: Record<string, unknown> | null;
  fallbackEmail?: string | null;
  fallbackName?: string | null;
}) {
  let resolvedEmail =
    input.identityClaims ? extractEmailFromIdentityClaims(input.identityClaims) : null;
  let resolvedName =
    input.identityClaims ? extractNameFromIdentityClaims(input.identityClaims) : null;

  resolvedEmail ??= input.fallbackEmail?.trim().toLowerCase() ?? null;
  resolvedName ??= input.fallbackName?.trim() ?? null;

  if (!resolvedEmail || !resolvedName) {
    try {
      const privyUser = await getPrivyClient().users()._get(input.providerUserId);
      const claims = privyUser as unknown as Record<string, unknown>;

      resolvedEmail ??= extractEmailFromIdentityClaims(claims);
      resolvedName ??= extractNameFromIdentityClaims(claims);
    } catch {
      return {
        email: resolvedEmail,
        name: resolvedName,
      };
    }
  }

  return {
    email: resolvedEmail,
    name: resolvedName,
  };
}

async function findLinkableMerchant(email: string) {
  return MerchantModel.findOne({
    supportEmail: email,
    $or: [{ authProviderUserId: null }, { authProviderUserId: "" }],
  })
    .sort({ createdAt: 1 })
    .exec();
}

export async function getAuthenticatedUser(input: AuthTokenPayload) {
  if (input.sub !== input.merchantId) {
    throw new HttpError(401, "Authenticated account is not valid.");
  }

  const merchant = await MerchantModel.findById(input.merchantId).exec();

  if (!merchant || merchant.status !== "active") {
    throw new HttpError(401, "Authenticated account is not active.");
  }

  return toAuthenticatedUser(merchant);
}

export async function exchangePrivySession(input: PrivySessionInput) {
  const authClaims = await verifyPrivyJwt(input.authToken);
  const identityClaims = await verifyPrivyIdentityToken(input.identityToken);
  const providerUserId = authClaims.user_id?.trim() || null;
  const operatorWalletAddress = input.operatorWalletAddress
    ? normalizeEvmAddress(input.operatorWalletAddress)
    : null;

  if (!providerUserId) {
    throw new HttpError(401, "Privy session is missing a subject.");
  }

  if (input.operatorWalletAddress && !operatorWalletAddress) {
    throw new HttpError(400, "Operator wallet address is invalid.");
  }

  const resolvedProfile = await resolvePrivyProfile({
    providerUserId,
    identityClaims,
    fallbackEmail: input.email ?? null,
    fallbackName: null,
  });
  const resolvedEmail = resolvedProfile.email;

  if (!resolvedEmail) {
    throw new HttpError(409, "Privy session is missing an email address.");
  }

  const resolvedName = resolvedProfile.name?.trim() || resolvedEmail;
  let merchant = await MerchantModel.findOne({
    authProvider: "privy",
    authProviderUserId: providerUserId,
  }).exec();

  if (!merchant) {
    merchant = await findLinkableMerchant(resolvedEmail);
  }

  let createdMerchant = false;

  if (!merchant) {
    merchant = await MerchantModel.create({
      merchantAccount:
        operatorWalletAddress ?? `merchant:${randomBytes(16).toString("hex")}`,
      payoutWallet: createUnconfiguredAddress(),
      ownerName: resolvedName,
      name: null,
      supportEmail: resolvedEmail,
      timezone: "UTC",
      supportedMarkets: [],
      metadataHash: "0x0",
      status: "active",
      authProvider: "privy",
      authProviderUserId: providerUserId,
      operatorWalletAddress,
      onboardingStatus: "business",
    });
    createdMerchant = true;
  } else {
    merchant.authProvider = "privy";
    merchant.authProviderUserId = providerUserId;
    merchant.supportEmail = merchant.supportEmail ?? resolvedEmail;
    merchant.ownerName = merchant.ownerName ?? resolvedName;

    if (operatorWalletAddress && !merchant.operatorWalletAddress) {
      merchant.operatorWalletAddress = operatorWalletAddress;
    }

    await merchant.save();
  }

  if (createdMerchant) {
    await appendAuditLog({
      merchantId: merchant._id.toString(),
      actor: resolvedName,
      action: "Started merchant onboarding",
      category: "workspace",
      status: "ok",
      target: resolvedEmail,
      detail: `${resolvedEmail} started merchant onboarding with Privy.`,
      metadata: {
        authProvider: "privy",
      },
      ipAddress: null,
      userAgent: null,
    }).catch(() => undefined);
  }

  const user = toAuthenticatedUser(merchant);

  return {
    ...issueAccessToken({
      accountId: user.accountId,
      merchantId: user.merchantId,
    }),
    user,
  };
}
