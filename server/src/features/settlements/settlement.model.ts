import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const settlementSchema = new Schema(
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
    sourceChargeId: {
      type: Schema.Types.ObjectId,
      ref: "Charge",
      default: null,
    },
    payoutBatchId: {
      type: Schema.Types.ObjectId,
      ref: "PayoutBatch",
      default: null,
    },
    batchRef: {
      type: String,
      required: true,
      trim: true,
    },
    sourceKind: {
      type: String,
      trim: true,
      default: "subscription",
    },
    commercialRef: {
      type: String,
      trim: true,
      default: null,
    },
    localAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    fxRate: {
      type: Number,
      min: 0,
      default: null,
    },
    grossUsdc: {
      type: Number,
      required: true,
      min: 0,
    },
    feeUsdc: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    netUsdc: {
      type: Number,
      required: true,
      min: 0,
    },
    destinationWallet: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "queued",
    },
    txHash: {
      type: String,
      trim: true,
      default: null,
    },
    bridgeSourceTxHash: {
      type: String,
      trim: true,
      default: null,
    },
    bridgeReceiveTxHash: {
      type: String,
      trim: true,
      default: null,
    },
    creditTxHash: {
      type: String,
      trim: true,
      default: null,
    },
    protocolExecutionKind: {
      type: String,
      trim: true,
      default: null,
    },
    protocolAmountUsdc: {
      type: Number,
      min: 0,
      default: null,
    },
    protocolChargeId: {
      type: String,
      trim: true,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    bridgeAttestedAt: {
      type: Date,
      default: null,
    },
    scheduledFor: {
      type: Date,
      required: true,
    },
    settledAt: {
      type: Date,
      default: null,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    reversalReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

settlementSchema.index({ merchantId: 1, environment: 1, status: 1, createdAt: -1 });
settlementSchema.index({ merchantId: 1, payoutBatchId: 1, status: 1 });
settlementSchema.index({ payoutBatchId: 1 }, { sparse: true });

type SettlementEntry = InferSchemaType<typeof settlementSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type SettlementDocument = SettlementEntry;

export const SettlementModel =
  (models.Settlement as Model<SettlementDocument> | undefined) ??
  model<SettlementDocument>("Settlement", settlementSchema);
