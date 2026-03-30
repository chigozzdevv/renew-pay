import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const checkoutSessionSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    developerKeyId: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: "DeveloperKey",
      default: null,
    },
    planId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Plan",
    },
    environment: {
      type: String,
      required: true,
      trim: true,
      default: "test",
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "open",
    },
    clientTokenHash: {
      type: String,
      required: true,
      trim: true,
    },
    planSnapshot: {
      type: {
        planCode: { type: String, required: true, trim: true },
        name: { type: String, required: true, trim: true },
        usdAmount: { type: Number, required: true, min: 0 },
        billingIntervalDays: { type: Number, required: true, min: 1 },
        trialDays: { type: Number, required: true, min: 0 },
        retryWindowHours: { type: Number, required: true, min: 0 },
        billingMode: { type: String, required: true, trim: true },
        supportedMarkets: { type: [String], required: true, default: [] },
      },
      required: true,
    },
    customerDraft: {
      type: {
        name: { type: String, trim: true, default: null },
        email: { type: String, trim: true, lowercase: true, default: null },
        market: { type: String, trim: true, uppercase: true, default: null },
      },
      default: null,
    },
    verificationSnapshot: {
      type: {
        provider: { type: String, trim: true, default: null },
        status: { type: String, trim: true, default: null },
        country: { type: String, trim: true, uppercase: true, default: null },
        currency: { type: String, trim: true, uppercase: true, default: null },
        instructions: { type: String, trim: true, default: null },
        accountName: { type: String, trim: true, default: null },
        verificationMethod: { type: String, trim: true, default: null },
        verificationMethods: { type: Schema.Types.Mixed, default: [] },
        requiredFields: { type: [String], default: [] },
      },
      default: null,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    chargeId: {
      type: Schema.Types.ObjectId,
      ref: "Charge",
      default: null,
    },
    settlementId: {
      type: Schema.Types.ObjectId,
      ref: "Settlement",
      default: null,
    },
    paymentSnapshot: {
      type: {
        provider: { type: String, trim: true, default: null },
        kind: { type: String, trim: true, default: null },
        externalChargeId: { type: String, trim: true, default: null },
        billingCurrency: { type: String, trim: true, uppercase: true, default: null },
        localAmount: { type: Number, min: 0, default: null },
        usdcAmount: { type: Number, min: 0, default: null },
        feeAmount: { type: Number, min: 0, default: null },
        status: { type: String, trim: true, default: null },
        reference: { type: String, trim: true, default: null },
        expiresAt: { type: Date, default: null },
        redirectUrl: { type: String, trim: true, default: null },
        bankTransfer: {
          type: {
            bankCode: { type: String, trim: true, default: null },
            bankName: { type: String, trim: true, default: null },
            accountNumber: { type: String, trim: true, default: null },
            accountName: { type: String, trim: true, default: null },
            currency: { type: String, trim: true, uppercase: true, default: null },
          },
          default: null,
        },
      },
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

checkoutSessionSchema.index({ clientTokenHash: 1 });
checkoutSessionSchema.index({ merchantId: 1, status: 1, createdAt: -1 });
checkoutSessionSchema.index({ expiresAt: 1 });

type CheckoutSessionEntry = InferSchemaType<typeof checkoutSessionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckoutSessionDocument = CheckoutSessionEntry;

export const CheckoutSessionModel =
  (models.CheckoutSession as Model<CheckoutSessionDocument> | undefined) ??
  model<CheckoutSessionDocument>("CheckoutSession", checkoutSessionSchema);
