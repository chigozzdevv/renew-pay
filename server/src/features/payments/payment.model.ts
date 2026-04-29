import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const paymentRecurringSchema = new Schema(
  {
    enabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    interval: {
      type: String,
      trim: true,
      default: null,
    },
    intervalCount: {
      type: Number,
      min: 1,
      default: null,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const paymentCollectionSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
      default: "partna",
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "not_started",
    },
    externalId: {
      type: String,
      trim: true,
      default: null,
    },
    localAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    fxRate: {
      type: Number,
      min: 0,
      default: null,
    },
    stableAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    feeAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const paymentSchema = new Schema(
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
    payId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    settlementRouteId: {
      type: Schema.Types.ObjectId,
      ref: "SettlementRoute",
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "open",
    },
    paymentUrl: {
      type: String,
      required: true,
      trim: true,
    },
    recurring: {
      type: paymentRecurringSchema,
      required: true,
      default: () => ({ enabled: false }),
    },
    collection: {
      type: paymentCollectionSchema,
      required: true,
      default: () => ({ provider: "partna", status: "not_started" }),
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

paymentSchema.index({ merchantId: 1, environment: 1, createdAt: -1 });
paymentSchema.index({ merchantId: 1, environment: 1, status: 1, createdAt: -1 });
paymentSchema.index({ merchantId: 1, environment: 1, payId: 1 }, { unique: true });
paymentSchema.index({ customerId: 1, createdAt: -1 }, { sparse: true });

type PaymentEntry = InferSchemaType<typeof paymentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentDocument = PaymentEntry;
export type PaymentRecord = HydratedDocument<PaymentEntry>;

export const PaymentModel =
  (models.Payment as Model<PaymentRecord> | undefined) ??
  model<PaymentRecord>("Payment", paymentSchema);
