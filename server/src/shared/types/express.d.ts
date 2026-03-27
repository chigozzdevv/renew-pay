declare namespace Express {
  interface PlatformAuthUser {
    teamMemberId: string;
    merchantId: string;
    name: string;
    email: string;
    role: string;
    permissions: string[];
    status: string;
    workspaceMode: "test" | "live";
  }

  interface DeveloperAuthContext {
    developerKeyId: string;
    merchantId: string;
    environment: "test" | "live";
    label: string;
  }

  interface CheckoutSessionAuthContext {
    sessionId: string;
  }

  interface Request {
    rawBody?: string;
    platformAuthUser?: PlatformAuthUser;
    developerAuth?: DeveloperAuthContext;
    checkoutSessionAuth?: CheckoutSessionAuthContext;
  }
}
