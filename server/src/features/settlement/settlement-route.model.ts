import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const settlementRoutePrivacySchema = new Schema(
  {
    provider: {
      type: String,
      trim: true,
      default: null,
    },
    strategy: {
      type: String,
      trim: true,
      default: null,
    },
    poolMint: {
      type: String,
      trim: true,
      default: null,
    },
    viewingKeyPolicy: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const settlementRouteSchema = new Schema(
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
    routeCode: {
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
      default: "direct",
    },
    chain: {
      type: String,
      required: true,
      trim: true,
      default: "solana",
    },
    assetSymbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "USDC",
    },
    assetMint: {
      type: String,
      trim: true,
      default: null,
    },
    assetDecimals: {
      type: Number,
      required: true,
      min: 0,
      default: 6,
    },
    destinationAddress: {
      type: String,
      trim: true,
      default: null,
    },
    feeBps: {
      type: Number,
      required: true,
      min: 0,
      max: 10000,
      default: 0,
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
    privacy: {
      type: settlementRoutePrivacySchema,
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

settlementRouteSchema.index(
  { merchantId: 1, environment: 1, routeCode: 1 },
  { unique: true }
);
settlementRouteSchema.index({ merchantId: 1, environment: 1, status: 1 });
settlementRouteSchema.index(
  { merchantId: 1, environment: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDefault: true,
    },
  }
);

type SettlementRouteEntry = InferSchemaType<typeof settlementRouteSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type SettlementRouteDocument = SettlementRouteEntry;
export type SettlementRouteRecord = HydratedDocument<SettlementRouteEntry>;

export const SettlementRouteModel =
  (models.SettlementRoute as Model<SettlementRouteRecord> | undefined) ??
  model<SettlementRouteRecord>("SettlementRoute", settlementRouteSchema);
