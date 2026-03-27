import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const paymentRailEventSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "yellow-card",
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
    state: {
      type: String,
      required: true,
      trim: true,
      default: "unknown",
    },
    externalId: {
      type: String,
      trim: true,
      default: null,
    },
    sequenceId: {
      type: String,
      trim: true,
      default: null,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
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

paymentRailEventSchema.index(
  { provider: 1, environment: 1, eventKey: 1 },
  { unique: true }
);
paymentRailEventSchema.index({ provider: 1, createdAt: -1 });

type PaymentRailEventEntry = InferSchemaType<typeof paymentRailEventSchema> & {
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentRailEventDocument = PaymentRailEventEntry;

export const PaymentRailEventModel =
  (models.PaymentRailEvent as Model<PaymentRailEventDocument> | undefined) ??
  model<PaymentRailEventDocument>("PaymentRailEvent", paymentRailEventSchema);
