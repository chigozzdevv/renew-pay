import {
  createRenewCheckoutClient,
  type RenewCheckoutClient,
} from "../clients/checkout-client.js";
import {
  inferRenewEnvironmentFromSecretKey,
  resolveRenewApiOrigin,
  validateRenewApiEnvironment,
} from "../shared/environment.js";
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  RenewEnvironment,
  RenewCheckoutPlan,
  RenewCheckoutSession,
  SubmitCheckoutCustomerInput,
} from "../types/checkout.js";

type FetchImplementation = typeof fetch;

type RenewServerClientConfig = {
  readonly apiOrigin?: string;
  readonly environment?: RenewEnvironment;
  readonly secretKey: string;
  readonly fetch?: FetchImplementation;
};

export type RenewServerClient = {
  listCheckoutPlans(): Promise<readonly RenewCheckoutPlan[]>;
  createCheckoutSession(
    input: CreateCheckoutSessionInput
  ): Promise<CreateCheckoutSessionResult>;
  getCheckoutSession(
    sessionId: string,
    clientSecret: string
  ): Promise<RenewCheckoutSession>;
  submitCheckoutCustomer(
    sessionId: string,
    clientSecret: string,
    input: SubmitCheckoutCustomerInput
  ): Promise<RenewCheckoutSession>;
  completeTestCheckoutPayment(
    sessionId: string,
    clientSecret: string
  ): Promise<RenewCheckoutSession>;
  raw: RenewCheckoutClient;
};

export function createRenewServerClient(
  config: RenewServerClientConfig
): RenewServerClient {
  const inferredEnvironment =
    config.environment ?? inferRenewEnvironmentFromSecretKey(config.secretKey);
  const apiOrigin = resolveRenewApiOrigin({
    apiOrigin: config.apiOrigin,
    environment: inferredEnvironment,
  });

  validateRenewApiEnvironment({
    apiOrigin,
    environment: inferredEnvironment,
    secretKey: config.secretKey,
  });

  const checkoutClient = createRenewCheckoutClient({
    apiOrigin,
    environment: inferredEnvironment,
    fetch: config.fetch,
  });

  return {
    raw: checkoutClient,
    listCheckoutPlans() {
      return checkoutClient.listPlans({ secretKey: config.secretKey });
    },
    createCheckoutSession(input) {
      return checkoutClient.createSession(input, { secretKey: config.secretKey });
    },
    getCheckoutSession(sessionId, clientSecret) {
      return checkoutClient.getSession(sessionId, { clientSecret });
    },
    submitCheckoutCustomer(sessionId, clientSecret, input) {
      return checkoutClient.submitCustomer(sessionId, input, { clientSecret });
    },
    completeTestCheckoutPayment(sessionId, clientSecret) {
      return checkoutClient.completeTestPayment(sessionId, { clientSecret });
    },
  };
}
