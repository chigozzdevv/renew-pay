import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const payoutBatchSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    environment: {
      type: String,
      required: true,
      enum: ["test", "live"],
      default: "test",
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
      default: "open",
    },
    trigger: {
      type: String,
      required: true,
      trim: true,
      default: "manual",
    },
    settlementIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      ref: "Settlement",
      default: [],
    },
    grossUsdc: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
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
      default: 0,
    },
    txHash: {
      type: String,
      trim: true,
      default: null,
    },
    openedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    executedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

payoutBatchSchema.index({ merchantId: 1, environment: 1, status: 1, createdAt: -1 });

type PayoutBatchEntry = InferSchemaType<typeof payoutBatchSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type PayoutBatchDocument = PayoutBatchEntry;

export const PayoutBatchModel =
  (models.PayoutBatch as Model<PayoutBatchDocument> | undefined) ??
  model<PayoutBatchDocument>("PayoutBatch", payoutBatchSchema);
