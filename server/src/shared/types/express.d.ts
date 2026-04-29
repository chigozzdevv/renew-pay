declare namespace Express {
  interface PlatformAuthUser {
    accountId: string;
    merchantId: string;
    name: string;
    email: string;
    permissions: string[];
    status: string;
    workspaceMode: "test" | "live";
    markets: string[];
    lastActiveAt: Date | null;
    authProvider: string;
    operatorWalletAddress: string | null;
    onboardingStatus: string;
  }

  interface DeveloperAuthContext {
    developerKeyId: string;
    merchantId: string;
    environment: "test" | "live";
    label: string;
  }

  interface Request {
    rawBody?: string;
    platformAuthUser?: PlatformAuthUser;
    developerAuth?: DeveloperAuthContext;
  }
}
