import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const treasuryAccountSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    environment: {
      type: String,
      required: true,
      enum: ["test", "live"],
      default: "test",
    },
    custodyModel: {
      type: String,
      required: true,
      trim: true,
      default: "squads",
    },
    governanceMultisigAddress: {
      type: String,
      required: true,
      trim: true,
    },
    governanceVaultAddress: {
      type: String,
      required: true,
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
    ownerAddresses: {
      type: [String],
      required: true,
      default: [],
    },
    threshold: {
      type: Number,
      required: true,
      min: 1,
      default: 2,
    },
    governanceVaultIndex: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    network: {
      type: String,
      required: true,
      trim: true,
      default: "solana",
    },
    gasPolicy: {
      type: String,
      required: true,
      trim: true,
      default: "sponsored",
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "active",
    },
    pendingPayoutWallet: {
      type: String,
      trim: true,
      default: null,
    },
    payoutWalletChangeReadyAt: {
      type: Date,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

treasuryAccountSchema.index({ merchantId: 1, environment: 1 }, { unique: true });
treasuryAccountSchema.index(
  { governanceMultisigAddress: 1, environment: 1 },
  { unique: true }
);
treasuryAccountSchema.index(
  { governanceVaultAddress: 1, environment: 1 },
  { unique: true }
);

type TreasuryAccountEntry = InferSchemaType<typeof treasuryAccountSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type TreasuryAccountDocument = TreasuryAccountEntry;

export const TreasuryAccountModel =
  (models.TreasuryAccount as Model<TreasuryAccountDocument> | undefined) ??
  model<TreasuryAccountDocument>("TreasuryAccount", treasuryAccountSchema);
