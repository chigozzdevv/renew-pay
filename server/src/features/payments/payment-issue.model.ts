import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const paymentIssueFileSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
      default: null,
    },
    size: {
      type: Number,
      min: 0,
      default: null,
    },
    publicId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const paymentIssueSchema = new Schema(
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
    paymentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Payment",
    },
    payId: {
      type: String,
      required: true,
      trim: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    payoutId: {
      type: Schema.Types.ObjectId,
      ref: "Payout",
      default: null,
    },
    issueType: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: String,
      required: true,
      trim: true,
    },
    reporterEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    reporterName: {
      type: String,
      trim: true,
      default: null,
    },
    files: {
      type: [paymentIssueFileSchema],
      default: [],
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "open",
    },
    heldAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

paymentIssueSchema.index({ merchantId: 1, environment: 1, createdAt: -1 });
paymentIssueSchema.index({ paymentId: 1, status: 1, createdAt: -1 });
paymentIssueSchema.index({ payId: 1, createdAt: -1 });

type PaymentIssueEntry = InferSchemaType<typeof paymentIssueSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentIssueDocument = PaymentIssueEntry;

export const PaymentIssueModel =
  (models.PaymentIssue as Model<PaymentIssueDocument> | undefined) ??
  model<PaymentIssueDocument>("PaymentIssue", paymentIssueSchema);
