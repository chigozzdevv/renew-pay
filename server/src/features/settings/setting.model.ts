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
    invoicePrefix: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "RNL",
    },
    billingTimezone: {
      type: String,
      required: true,
      trim: true,
      default: "UTC",
    },
    billingDisplay: {
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
      default: "pay.renew.sh",
    },
    invoiceFooter: {
      type: String,
      required: true,
      trim: true,
      default: "Thanks for billing with Renew.",
    },
  },
  {
    _id: false,
  }
);

const billingSettingsSchema = new Schema(
  {
    retryPolicy: {
      type: String,
      required: true,
      trim: true,
      default: "Smart retries",
    },
    invoiceGraceDays: {
      type: Number,
      required: true,
      min: 0,
      default: 2,
    },
    autoRetries: {
      type: Boolean,
      required: true,
      default: true,
    },
    meterApproval: {
      type: Boolean,
      required: true,
      default: true,
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
      required: true,
      trim: true,
    },
    reserveWallet: {
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
    financeDigest: {
      type: Boolean,
      required: true,
      default: true,
    },
    developerAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
    loginAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
    customerSubscriptionEmails: {
      type: Boolean,
      required: true,
      default: true,
    },
    customerReceiptEmails: {
      type: Boolean,
      required: true,
      default: true,
    },
    customerPaymentFollowUps: {
      type: Boolean,
      required: true,
      default: true,
    },
    merchantSubscriptionAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
    merchantPaymentDigestFrequency: {
      type: String,
      required: true,
      trim: true,
      default: "daily",
    },
    merchantPaymentDigestMode: {
      type: String,
      required: true,
      trim: true,
      default: "counts",
    },
    teamInviteEmails: {
      type: Boolean,
      required: true,
      default: true,
    },
    governanceAlerts: {
      type: Boolean,
      required: true,
      default: true,
    },
    treasuryAlerts: {
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
    inviteDomainPolicy: {
      type: String,
      required: true,
      trim: true,
      default: "Allow all domains",
    },
    enforceTwoFactor: {
      type: Boolean,
      required: true,
      default: false,
    },
    restrictInviteDomains: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const treasurySettingsSchema = new Schema(
  {
    sweepApprovalThreshold: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default: 1,
    },
    payoutMode: {
      type: String,
      required: true,
      trim: true,
      default: "manual",
    },
    autoPayoutFrequency: {
      type: String,
      trim: true,
      default: null,
    },
    autoPayoutTimeLocal: {
      type: String,
      trim: true,
      default: "09:00",
    },
    thresholdPayoutEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    autoPayoutThresholdUsdc: {
      type: Number,
      min: 0,
      default: null,
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
    billing: {
      type: billingSettingsSchema,
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
    treasury: {
      type: treasurySettingsSchema,
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
