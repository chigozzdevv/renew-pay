import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const planSchema = new Schema(
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
    planCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    usdAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    usageRate: {
      type: Number,
      min: 0,
      default: null,
    },
    billingIntervalDays: {
      type: Number,
      required: true,
      min: 1,
    },
    trialDays: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    retryWindowHours: {
      type: Number,
      required: true,
      min: 0,
      default: 24,
    },
    billingMode: {
      type: String,
      required: true,
      trim: true,
      default: "fixed",
    },
    supportedMarkets: {
      type: [String],
      required: true,
      default: [],
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "draft",
    },
    pendingStatus: {
      type: String,
      trim: true,
      default: null,
    },
    protocolPlanId: {
      type: String,
      trim: true,
      default: null,
    },
    protocolOperationId: {
      type: Schema.Types.ObjectId,
      ref: "TreasuryOperation",
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

type PlanEntry = InferSchemaType<typeof planSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type PlanDocument = PlanEntry;
export type PlanRecord = HydratedDocument<PlanEntry>;

export const PlanModel =
  (models.Plan as Model<PlanRecord> | undefined) ??
  model<PlanRecord>("Plan", planSchema);
