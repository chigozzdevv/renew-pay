import {
  createRenewPaymentClient,
  type RenewPaymentClient,
} from "../clients/payment-client.js";
import {
  inferRenewEnvironmentFromSecretKey,
  resolveRenewApiOrigin,
  validateRenewApiEnvironment,
} from "../shared/environment.js";
import type {
  CreateRenewCollectionInput,
  CreateRenewPaymentInput,
  ListRenewCollectionsQuery,
  ListRenewPaymentsQuery,
  RenewCollectionRecord,
  RenewEnvironment,
  RenewPaymentRecord,
  RenewPublicPaymentRecord,
  StartRenewPublicPaymentInput,
  UpdateRenewPaymentInput,
} from "../types/payment.js";
import type {
  CreateRenewSettlementAccountInput,
  ListRenewSettlementAccountsQuery,
  RenewSettlementAccountRecord,
  UpdateRenewSettlementAccountInput,
} from "../types/settlement.js";

type FetchImplementation = typeof fetch;

type RenewServerClientConfig = {
  readonly apiOrigin?: string;
  readonly environment?: RenewEnvironment;
  readonly secretKey: string;
  readonly fetch?: FetchImplementation;
};

export type RenewServerClient = {
  collections: {
    create(input: CreateRenewCollectionInput): Promise<RenewCollectionRecord>;
    list(query?: ListRenewCollectionsQuery): Promise<readonly RenewCollectionRecord[]>;
    get(collectionId: string): Promise<RenewCollectionRecord>;
    cancel(collectionId: string): Promise<RenewCollectionRecord>;
  };
  settlement: {
    accounts: {
      create(
        input: CreateRenewSettlementAccountInput
      ): Promise<RenewSettlementAccountRecord>;
      list(
        query?: ListRenewSettlementAccountsQuery
      ): Promise<readonly RenewSettlementAccountRecord[]>;
      getDefault(): Promise<RenewSettlementAccountRecord>;
      get(accountId: string): Promise<RenewSettlementAccountRecord>;
      update(
        accountId: string,
        input: UpdateRenewSettlementAccountInput
      ): Promise<RenewSettlementAccountRecord>;
    };
  };
  createPayment(input: CreateRenewPaymentInput): Promise<RenewPaymentRecord>;
  listPayments(query?: ListRenewPaymentsQuery): Promise<readonly RenewPaymentRecord[]>;
  getPayment(paymentId: string): Promise<RenewPaymentRecord>;
  updatePayment(
    paymentId: string,
    input: UpdateRenewPaymentInput
  ): Promise<RenewPaymentRecord>;
  getPublicPayment(payId: string): Promise<RenewPublicPaymentRecord>;
  startPublicPayment(
    payId: string,
    input: StartRenewPublicPaymentInput
  ): Promise<RenewPublicPaymentRecord>;
  raw: RenewPaymentClient;
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

  const paymentClient = createRenewPaymentClient({
    apiOrigin,
    environment: inferredEnvironment,
    fetch: config.fetch,
  });

  return {
    raw: paymentClient,
    collections: {
      create(input) {
        return paymentClient.createCollection(input, {
          secretKey: config.secretKey,
        });
      },
      list(query) {
        return paymentClient.listCollections(query, {
          secretKey: config.secretKey,
        });
      },
      get(collectionId) {
        return paymentClient.getCollection(collectionId, {
          secretKey: config.secretKey,
        });
      },
      cancel(collectionId) {
        return paymentClient.cancelCollection(collectionId, {
          secretKey: config.secretKey,
        });
      },
    },
    settlement: {
      accounts: {
        create(input) {
          return paymentClient.createSettlementAccount(input, {
            secretKey: config.secretKey,
          });
        },
        list(query) {
          return paymentClient.listSettlementAccounts(query, {
            secretKey: config.secretKey,
          });
        },
        getDefault() {
          return paymentClient.getDefaultSettlementAccount({
            secretKey: config.secretKey,
          });
        },
        get(accountId) {
          return paymentClient.getSettlementAccount(accountId, {
            secretKey: config.secretKey,
          });
        },
        update(accountId, input) {
          return paymentClient.updateSettlementAccount(accountId, input, {
            secretKey: config.secretKey,
          });
        },
      },
    },
    createPayment(input) {
      return paymentClient.createPayment(input, { secretKey: config.secretKey });
    },
    listPayments(query) {
      return paymentClient.listPayments(query, { secretKey: config.secretKey });
    },
    getPayment(paymentId) {
      return paymentClient.getPayment(paymentId, { secretKey: config.secretKey });
    },
    updatePayment(paymentId, input) {
      return paymentClient.updatePayment(paymentId, input, {
        secretKey: config.secretKey,
      });
    },
    getPublicPayment(payId) {
      return paymentClient.getPublicPayment(payId);
    },
    startPublicPayment(payId, input) {
      return paymentClient.startPublicPayment(payId, input);
    },
  };
}
