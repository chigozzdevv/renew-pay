import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const channelSchema = new Schema(
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
    country: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    countryCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "active",
    },
    widgetStatus: {
      type: String,
      required: true,
      trim: true,
      default: "active",
    },
    apiStatus: {
      type: String,
      required: true,
      trim: true,
      default: "active",
    },
    channelType: {
      type: String,
      required: true,
      trim: true,
    },
    rampType: {
      type: String,
      required: true,
      trim: true,
    },
    settlementType: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedSettlementTime: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    min: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    max: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    widgetMin: {
      type: Number,
      min: 0,
      default: null,
    },
    widgetMax: {
      type: Number,
      min: 0,
      default: null,
    },
    feeLocal: {
      type: Number,
      min: 0,
      default: 0,
    },
    feeUSD: {
      type: Number,
      min: 0,
      default: 0,
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

channelSchema.index({ externalId: 1, environment: 1 }, { unique: true });

type ChannelEntry = InferSchemaType<typeof channelSchema>;

export type ChannelDocument = ChannelEntry & {
  createdAt: Date;
  updatedAt: Date;
};

export const ChannelModel =
  (models.Channel as Model<ChannelDocument> | undefined) ??
  model<ChannelDocument>("Channel", channelSchema);
