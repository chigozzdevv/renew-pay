import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const notificationSchema = new Schema(
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
    templateKey: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    audience: {
      type: String,
      required: true,
      trim: true,
    },
    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    recipientName: {
      type: String,
      trim: true,
      default: null,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    html: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "resend",
    },
    providerMessageId: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "queued",
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    errorMessage: {
      type: String,
      trim: true,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

notificationSchema.index({ merchantId: 1, environment: 1, createdAt: -1 });
notificationSchema.index({ merchantId: 1, templateKey: 1, status: 1, createdAt: -1 });
notificationSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
  }
);

type NotificationEntry = InferSchemaType<typeof notificationSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationDocument = NotificationEntry;

export const NotificationModel =
  (models.Notification as Model<NotificationDocument> | undefined) ??
  model<NotificationDocument>("Notification", notificationSchema);

