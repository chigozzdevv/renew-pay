import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const auditSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    actor: {
      type: String,
      required: true,
      trim: true,
      default: "system",
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      default: "workspace",
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "ok",
    },
    target: {
      type: String,
      trim: true,
      default: null,
    },
    detail: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },
    userAgent: {
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

auditSchema.index({ merchantId: 1, createdAt: -1 });
auditSchema.index({ merchantId: 1, category: 1, createdAt: -1 });

type AuditEntry = InferSchemaType<typeof auditSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type AuditDocument = AuditEntry;

export const AuditModel =
  (models.Audit as Model<AuditDocument> | undefined) ??
  model<AuditDocument>("Audit", auditSchema);
