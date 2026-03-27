import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const kycEventSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "sumsub",
    },
    environment: {
      type: String,
      required: true,
      enum: ["test", "live"],
      default: "test",
    },
    eventKey: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    applicantId: {
      type: String,
      trim: true,
      default: null,
    },
    externalUserId: {
      type: String,
      trim: true,
      default: null,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    result: {
      type: Schema.Types.Mixed,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

kycEventSchema.index({ provider: 1, environment: 1, eventKey: 1 }, { unique: true });
kycEventSchema.index({ applicantId: 1, environment: 1, createdAt: -1 });
kycEventSchema.index({ externalUserId: 1, environment: 1, createdAt: -1 });

type KycEventEntry = InferSchemaType<typeof kycEventSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type KycEventDocument = KycEventEntry;

export const KycEventModel =
  (models.KycEvent as Model<KycEventDocument> | undefined) ??
  model<KycEventDocument>("KycEvent", kycEventSchema);
