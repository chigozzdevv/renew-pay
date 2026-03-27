import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const developerKeySchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    environment: {
      type: String,
      required: true,
      trim: true,
      default: "test",
    },
    prefix: {
      type: String,
      required: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      trim: true,
    },
    lastFour: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "active",
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

developerKeySchema.index({ merchantId: 1, status: 1 });
developerKeySchema.index({ tokenHash: 1 }, { unique: true });

type DeveloperKeyEntry = InferSchemaType<typeof developerKeySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type DeveloperKeyDocument = DeveloperKeyEntry;

export const DeveloperKeyModel =
  (models.DeveloperKey as Model<DeveloperKeyDocument> | undefined) ??
  model<DeveloperKeyDocument>("DeveloperKey", developerKeySchema);
