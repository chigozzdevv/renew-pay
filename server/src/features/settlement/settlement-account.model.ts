import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const settlementAccountSchema = new Schema(
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
    accountCode: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mode: {
      type: String,
      required: true,
      trim: true,
      default: "standard",
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "renew_vault",
    },
    chain: {
      type: String,
      required: true,
      trim: true,
      default: "avalanche",
    },
    assetSymbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "USDC",
    },
    destinationAddress: {
      type: String,
      trim: true,
      default: null,
    },
    isDefault: {
      type: Boolean,
      required: true,
      default: false,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "active",
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

settlementAccountSchema.index(
  { merchantId: 1, environment: 1, accountCode: 1 },
  { unique: true }
);
settlementAccountSchema.index({ merchantId: 1, environment: 1, status: 1 });
settlementAccountSchema.index(
  { merchantId: 1, environment: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDefault: true,
    },
  }
);

type SettlementAccountEntry = InferSchemaType<typeof settlementAccountSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type SettlementAccountDocument = SettlementAccountEntry;
export type SettlementAccountRecord = HydratedDocument<SettlementAccountEntry>;

export const SettlementAccountModel =
  (models.SettlementAccount as Model<SettlementAccountRecord> | undefined) ??
  model<SettlementAccountRecord>("SettlementAccount", settlementAccountSchema);
