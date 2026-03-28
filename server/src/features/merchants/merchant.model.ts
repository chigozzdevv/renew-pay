import {
  HydratedDocument,
  InferSchemaType,
  Model,
  Schema,
  Types,
  model,
  models,
} from "mongoose";

const merchantSchema = new Schema(
  {
    merchantAccount: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    payoutWallet: {
      type: String,
      required: true,
      trim: true,
    },
    reserveWallet: {
      type: String,
      trim: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    supportEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    billingTimezone: {
      type: String,
      required: true,
      trim: true,
      default: "UTC",
    },
    supportedMarkets: {
      type: [String],
      required: true,
      default: [],
    },
    metadataHash: {
      type: String,
      trim: true,
      default: "0x0",
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "active",
    },
    authProvider: {
      type: String,
      required: true,
      trim: true,
      default: "privy",
    },
    authProviderUserId: {
      type: String,
      trim: true,
      default: null,
    },
    operatorWalletAddress: {
      type: String,
      trim: true,
      default: null,
    },
    onboardingStatus: {
      type: String,
      required: true,
      trim: true,
      default: "business",
    },
    governanceEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

merchantSchema.index(
  { authProvider: 1, authProviderUserId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      authProviderUserId: {
        $type: "string",
      },
    },
  }
);

type MerchantEntry = InferSchemaType<typeof merchantSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantDocument = MerchantEntry;
export type MerchantRecord = HydratedDocument<MerchantEntry>;

export const MerchantModel =
  (models.Merchant as Model<MerchantRecord> | undefined) ??
  model<MerchantRecord>("Merchant", merchantSchema);
