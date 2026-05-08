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
  CreateRenewSettlementRouteInput,
  ListRenewSettlementRoutesQuery,
  RenewSettlementRouteRecord,
  UpdateRenewSettlementRouteInput,
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
    routes: {
      create(
        input: CreateRenewSettlementRouteInput
      ): Promise<RenewSettlementRouteRecord>;
      list(
        query?: ListRenewSettlementRoutesQuery
      ): Promise<readonly RenewSettlementRouteRecord[]>;
      getDefault(): Promise<RenewSettlementRouteRecord>;
      get(routeId: string): Promise<RenewSettlementRouteRecord>;
      update(
        routeId: string,
        input: UpdateRenewSettlementRouteInput
      ): Promise<RenewSettlementRouteRecord>;
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
      routes: {
        create(input) {
          return paymentClient.createSettlementRoute(input, {
            secretKey: config.secretKey,
          });
        },
        list(query) {
          return paymentClient.listSettlementRoutes(query, {
            secretKey: config.secretKey,
          });
        },
        getDefault() {
          return paymentClient.getDefaultSettlementRoute({
            secretKey: config.secretKey,
          });
        },
        get(routeId) {
          return paymentClient.getSettlementRoute(routeId, {
            secretKey: config.secretKey,
          });
        },
        update(routeId, input) {
          return paymentClient.updateSettlementRoute(routeId, input, {
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
