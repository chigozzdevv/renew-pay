import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const kycCheckSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    subjectType: {
      type: String,
      required: true,
      enum: ["merchant", "team_member"],
    },
    subjectRef: {
      type: String,
      required: true,
      trim: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "sumsub",
    },
    mode: {
      type: String,
      required: true,
      enum: ["test", "live"],
      default: "test",
    },
    externalUserId: {
      type: String,
      required: true,
      trim: true,
    },
    applicantId: {
      type: String,
      trim: true,
      default: null,
    },
    levelName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["not_started", "pending", "approved", "rejected", "on_hold"],
      default: "not_started",
    },
    reviewStatus: {
      type: String,
      trim: true,
      default: null,
    },
    reviewAnswer: {
      type: String,
      trim: true,
      default: null,
    },
    rejectType: {
      type: String,
      trim: true,
      default: null,
    },
    rejectLabels: {
      type: [String],
      required: true,
      default: [],
    },
    moderationComment: {
      type: String,
      trim: true,
      default: null,
    },
    clientComment: {
      type: String,
      trim: true,
      default: null,
    },
    lastEventType: {
      type: String,
      trim: true,
      default: null,
    },
    lastEventAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: String,
      trim: true,
      default: "system",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

kycCheckSchema.index(
  { merchantId: 1, subjectType: 1, subjectRef: 1, mode: 1 },
  { unique: true }
);
kycCheckSchema.index({ applicantId: 1 }, { unique: true, sparse: true });
kycCheckSchema.index({ externalUserId: 1 }, { unique: true });
kycCheckSchema.index({ merchantId: 1, mode: 1, status: 1, subjectType: 1 });

type KycCheckEntry = InferSchemaType<typeof kycCheckSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type KycCheckDocument = KycCheckEntry;

export const KycCheckModel =
  (models.KycCheck as Model<KycCheckDocument> | undefined) ??
  model<KycCheckDocument>("KycCheck", kycCheckSchema);
