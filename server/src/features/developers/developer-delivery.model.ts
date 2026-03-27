import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const developerDeliverySchema = new Schema(
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
    webhookId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "DeveloperWebhook",
    },
    eventId: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
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
    httpStatus: {
      type: Number,
      default: null,
    },
    attempts: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    errorMessage: {
      type: String,
      trim: true,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

developerDeliverySchema.index({ merchantId: 1, environment: 1, createdAt: -1 });
developerDeliverySchema.index({ webhookId: 1, createdAt: -1 });
developerDeliverySchema.index({ webhookId: 1, eventId: 1 }, { unique: true });

type DeveloperDeliveryEntry = InferSchemaType<typeof developerDeliverySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type DeveloperDeliveryDocument = DeveloperDeliveryEntry;

export const DeveloperDeliveryModel =
  (models.DeveloperDelivery as Model<DeveloperDeliveryDocument> | undefined) ??
  model<DeveloperDeliveryDocument>("DeveloperDelivery", developerDeliverySchema);
