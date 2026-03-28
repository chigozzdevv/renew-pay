import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const chargeSchema = new Schema(
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
    sourceKind: {
      type: String,
      required: true,
      trim: true,
      default: "subscription",
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    externalChargeId: {
      type: String,
      required: true,
      trim: true,
    },
    settlementSource: {
      type: String,
      trim: true,
      default: null,
    },
    paymentProvider: {
      type: String,
      trim: true,
      default: "yellow_card",
    },
    localAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    fxRate: {
      type: Number,
      required: true,
      min: 0,
    },
    usdcAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    feeAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "pending",
    },
    failureCode: {
      type: String,
      trim: true,
      default: null,
    },
    protocolChargeId: {
      type: String,
      trim: true,
      default: null,
    },
    protocolSyncStatus: {
      type: String,
      trim: true,
      default: "not_synced",
    },
    protocolTxHash: {
      type: String,
      trim: true,
      default: null,
    },
    providerMetadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    processedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

chargeSchema.index({ merchantId: 1, environment: 1, sourceKind: 1, processedAt: -1 });
chargeSchema.index({ invoiceId: 1 }, { sparse: true });

type ChargeEntry = InferSchemaType<typeof chargeSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type ChargeDocument = ChargeEntry;

export const ChargeModel =
  (models.Charge as Model<ChargeDocument> | undefined) ??
  model<ChargeDocument>("Charge", chargeSchema);
