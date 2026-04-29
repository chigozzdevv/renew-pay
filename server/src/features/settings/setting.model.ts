import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const businessSettingsSchema = new Schema(
  {
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
    defaultMarket: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "NGN",
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "UTC",
    },
    displayMode: {
      type: String,
      required: true,
      trim: true,
      default: "local-fiat",
    },
    fallbackCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "USDC",
    },
    statementDescriptor: {
      type: String,
      required: true,
      trim: true,
      default: "RENEW",
    },
    brandAccent: {
      type: String,
      required: true,
      trim: true,
      default: "forest-green",
    },
    logoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    customerDomain: {
      type: String,
      required: true,
      trim: true,
      default: "app.renew.sh",
    },
  },
  {
    _id: false,
  }
);

const walletSettingsSchema = new Schema(
  {
    primaryWallet: {
      type: String,
      trim: true,
      default: null,
    },
    walletAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    _id: false,
  }
);

const notificationSettingsSchema = new Schema(
  {
    developerAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
    verificationAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
    securityAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    _id: false,
  }
);

const securitySettingsSchema = new Schema(
  {
    sessionTimeout: {
      type: String,
      required: true,
      trim: true,
      default: "30 minutes",
    },
    enforceTwoFactor: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const settingSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
      unique: true,
    },
    business: {
      type: businessSettingsSchema,
      required: true,
      default: () => ({}),
    },
    wallets: {
      type: walletSettingsSchema,
      required: true,
      default: () => ({}),
    },
    notifications: {
      type: notificationSettingsSchema,
      required: true,
      default: () => ({}),
    },
    security: {
      type: securitySettingsSchema,
      required: true,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

type SettingEntry = InferSchemaType<typeof settingSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type SettingDocument = SettingEntry;

export const SettingModel =
  (models.Setting as Model<SettingDocument> | undefined) ??
  model<SettingDocument>("Setting", settingSchema);
