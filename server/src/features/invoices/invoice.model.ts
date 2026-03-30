import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const invoiceLineItemSchema = new Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    unitAmountUsd: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmountUsd: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const invoiceSchema = new Schema(
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
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    publicToken: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    billingCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "issued",
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    lineItems: {
      type: [invoiceLineItemSchema],
      required: true,
      default: [],
    },
    usdAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    localAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    fxRate: {
      type: Number,
      required: true,
      min: 0,
    },
    usdcAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    feeAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    issuedAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    lastRemindedAt: {
      type: Date,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    paymentProvider: {
      type: String,
      trim: true,
      default: "partna",
    },
    verificationSnapshot: {
      type: {
        provider: { type: String, trim: true, default: null },
        status: { type: String, trim: true, default: null },
        country: { type: String, trim: true, uppercase: true, default: null },
        currency: { type: String, trim: true, uppercase: true, default: null },
        instructions: { type: String, trim: true, default: null },
        accountName: { type: String, trim: true, default: null },
        verificationMethod: { type: String, trim: true, default: null },
        verificationMethods: { type: Schema.Types.Mixed, default: [] },
        requiredFields: { type: [String], default: [] },
      },
      default: null,
    },
    paymentSnapshot: {
      type: {
        provider: { type: String, trim: true, default: null },
        kind: { type: String, trim: true, default: null },
        externalChargeId: { type: String, trim: true, default: null },
        billingCurrency: { type: String, trim: true, uppercase: true, default: null },
        localAmount: { type: Number, min: 0, default: null },
        usdcAmount: { type: Number, min: 0, default: null },
        feeAmount: { type: Number, min: 0, default: null },
        status: { type: String, trim: true, default: null },
        reference: { type: String, trim: true, default: null },
        expiresAt: { type: Date, default: null },
        redirectUrl: { type: String, trim: true, default: null },
        bankTransfer: {
          type: {
            bankCode: { type: String, trim: true, default: null },
            bankName: { type: String, trim: true, default: null },
            accountNumber: { type: String, trim: true, default: null },
            accountName: { type: String, trim: true, default: null },
            currency: { type: String, trim: true, uppercase: true, default: null },
          },
          default: null,
        },
      },
      default: null,
    },
    chargeId: {
      type: Schema.Types.ObjectId,
      ref: "Charge",
      default: null,
    },
    settlementId: {
      type: Schema.Types.ObjectId,
      ref: "Settlement",
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

invoiceSchema.index(
  { merchantId: 1, environment: 1, invoiceNumber: 1 },
  { unique: true }
);
invoiceSchema.index({ publicToken: 1 }, { unique: true });
invoiceSchema.index({ merchantId: 1, environment: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ customerId: 1, createdAt: -1 }, { sparse: true });

type InvoiceEntry = InferSchemaType<typeof invoiceSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoiceDocument = InvoiceEntry;
export type InvoiceRecord = HydratedDocument<InvoiceEntry>;

export const InvoiceModel =
  (models.Invoice as Model<InvoiceRecord> | undefined) ??
  model<InvoiceRecord>("Invoice", invoiceSchema);
