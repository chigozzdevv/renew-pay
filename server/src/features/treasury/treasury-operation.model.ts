import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const treasurySignatureSchema = new Schema(
  {
    teamMemberId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    signature: {
      type: String,
      required: true,
      trim: true,
    },
    signedAt: {
      type: Date,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const treasuryOperationSchema = new Schema(
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
    treasuryAccountId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "TreasuryAccount",
    },
    settlementId: {
      type: Schema.Types.ObjectId,
      ref: "Settlement",
      default: null,
    },
    kind: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "pending_signatures",
    },
    governanceMultisigAddress: {
      type: String,
      required: true,
      trim: true,
    },
    governanceVaultAddress: {
      type: String,
      required: true,
      trim: true,
    },
    threshold: {
      type: Number,
      required: true,
      min: 1,
    },
    targetAddress: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
      default: "0",
    },
    data: {
      type: String,
      required: true,
      trim: true,
    },
    origin: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
    },
    signatures: {
      type: [treasurySignatureSchema],
      required: true,
      default: [],
    },
    txHash: {
      type: String,
      trim: true,
      default: null,
    },
    rejectedBy: {
      type: String,
      trim: true,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    executedAt: {
      type: Date,
      default: null,
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

treasuryOperationSchema.index({
  merchantId: 1,
  environment: 1,
  status: 1,
  createdAt: -1,
});
treasuryOperationSchema.index({ settlementId: 1, environment: 1, kind: 1 });

type TreasuryOperationEntry = InferSchemaType<typeof treasuryOperationSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type TreasuryOperationDocument = TreasuryOperationEntry;

export const TreasuryOperationModel =
  (models.TreasuryOperation as Model<TreasuryOperationDocument> | undefined) ??
  model<TreasuryOperationDocument>("TreasuryOperation", treasuryOperationSchema);
