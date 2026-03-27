import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const networkSchema = new Schema(
  {
    externalId: {
      type: String,
      required: true,
      trim: true,
    },
    environment: {
      type: String,
      required: true,
      enum: ["test", "live"],
      default: "test",
    },
    code: {
      type: String,
      trim: true,
      default: null,
    },
    country: {
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
    status: {
      type: String,
      required: true,
      trim: true,
      default: "active",
    },
    accountNumberType: {
      type: String,
      trim: true,
      default: null,
    },
    countryAccountNumberType: {
      type: String,
      trim: true,
      default: null,
    },
    channelIds: {
      type: [String],
      required: true,
      default: [],
    },
    raw: {
      type: Schema.Types.Mixed,
      default: {},
    },
    lastSyncedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

networkSchema.index({ externalId: 1, environment: 1 }, { unique: true });

type NetworkEntry = InferSchemaType<typeof networkSchema>;

export type NetworkDocument = NetworkEntry & {
  createdAt: Date;
  updatedAt: Date;
};

export const NetworkModel =
  (models.Network as Model<NetworkDocument> | undefined) ??
  model<NetworkDocument>("Network", networkSchema);
