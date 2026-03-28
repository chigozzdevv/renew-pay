import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const customerSchema = new Schema(
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
    customerRef: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    market: {
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
    billingState: {
      type: String,
      required: true,
      trim: true,
      default: "healthy",
    },
    paymentMethodState: {
      type: String,
      required: true,
      trim: true,
      default: "ok",
    },
    subscriptionCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    monthlyVolumeUsdc: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    nextRenewalAt: {
      type: Date,
      default: null,
    },
    lastChargeAt: {
      type: Date,
      default: null,
    },
    autoReminderEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    blacklistedAt: {
      type: Date,
      default: null,
    },
    blacklistReason: {
      type: String,
      trim: true,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    paymentProvider: {
      type: String,
      trim: true,
      default: null,
    },
    paymentProfile: {
      type: {
        provider: { type: String, trim: true, default: null },
        status: { type: String, trim: true, default: null },
        verifiedAt: { type: Date, default: null },
        bankTransfer: {
          type: {
            bankCode: { type: String, trim: true, default: null },
            bankName: { type: String, trim: true, default: null },
            accountName: { type: String, trim: true, default: null },
            accountNumber: { type: String, trim: true, default: null },
            currency: { type: String, trim: true, uppercase: true, default: null },
          },
          default: null,
        },
        partna: {
          type: {
            email: { type: String, trim: true, lowercase: true, default: null },
            fullName: { type: String, trim: true, default: null },
            accountName: { type: String, trim: true, default: null },
            bvnLast4: { type: String, trim: true, default: null },
            callbackUrl: { type: String, trim: true, default: null },
            raw: { type: Schema.Types.Mixed, default: {} },
          },
          default: null,
        },
      },
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

customerSchema.index({ merchantId: 1, environment: 1, customerRef: 1 }, { unique: true });
customerSchema.index({ merchantId: 1, environment: 1, email: 1 }, { unique: true });
customerSchema.index({ merchantId: 1, environment: 1, status: 1, market: 1 });

type CustomerEntry = InferSchemaType<typeof customerSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type CustomerDocument = CustomerEntry;

export const CustomerModel =
  (models.Customer as Model<CustomerDocument> | undefined) ??
  model<CustomerDocument>("Customer", customerSchema);
