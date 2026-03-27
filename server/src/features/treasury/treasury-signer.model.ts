import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const treasurySignerSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
    },
    teamMemberId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "TeamMember",
    },
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "pending",
    },
    challengeNonce: {
      type: String,
      trim: true,
      default: null,
    },
    challengeMessage: {
      type: String,
      trim: true,
      default: null,
    },
    challengeIssuedAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    lastApprovedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

treasurySignerSchema.index({ merchantId: 1, teamMemberId: 1 }, { unique: true });
treasurySignerSchema.index({ merchantId: 1, walletAddress: 1 }, { unique: true });

type TreasurySignerEntry = InferSchemaType<typeof treasurySignerSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type TreasurySignerDocument = TreasurySignerEntry;

export const TreasurySignerModel =
  (models.TreasurySigner as Model<TreasurySignerDocument> | undefined) ??
  model<TreasurySignerDocument>("TreasurySigner", treasurySignerSchema);
