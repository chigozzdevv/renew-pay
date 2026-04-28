import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const subscriptionSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    environment: {
      type: String,
      required: true,
      trim: true,
      default: "test",
    },
    planId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Plan",
    },
    customerRef: {
      type: String,
      required: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    billingCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    localAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentProvider: {
      type: String,
      trim: true,
      default: "partna",
    },
    paymentAccountType: {
      type: String,
      required: true,
      trim: true,
      default: "bank",
    },
    paymentAccountNumber: {
      type: String,
      trim: true,
      default: null,
    },
    paymentNetworkId: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "pending_activation",
    },
    pendingStatus: {
      type: String,
      trim: true,
      default: null,
    },
    nextChargeAt: {
      type: Date,
      required: true,
    },
    lastChargeAt: {
      type: Date,
      default: null,
    },
    retryAvailableAt: {
      type: Date,
      default: null,
    },
    paymentProfileSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

type SubscriptionEntry = InferSchemaType<typeof subscriptionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type SubscriptionDocument = SubscriptionEntry;
export type SubscriptionRecord = HydratedDocument<SubscriptionEntry>;

export const SubscriptionModel =
  (models.Subscription as Model<SubscriptionRecord> | undefined) ??
  model<SubscriptionRecord>("Subscription", subscriptionSchema);
