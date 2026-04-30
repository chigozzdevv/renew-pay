import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const onrampEventSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "partna",
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

onrampEventSchema.index(
  { provider: 1, environment: 1, eventKey: 1 },
  { unique: true }
);
onrampEventSchema.index({ provider: 1, createdAt: -1 });

type OnrampEventEntry = InferSchemaType<typeof onrampEventSchema> & {
  createdAt: Date;
  updatedAt: Date;
};

export type OnrampEventDocument = OnrampEventEntry;

export const OnrampEventModel =
  (models.OnrampEvent as Model<OnrampEventDocument> | undefined) ??
  model<OnrampEventDocument>("OnrampEvent", onrampEventSchema);
