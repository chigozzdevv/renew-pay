import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const teamMemberSchema = new Schema(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Merchant",
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
    role: {
      type: String,
      required: true,
      trim: true,
      default: "support",
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: "invited",
    },
    markets: {
      type: [String],
      required: true,
      default: [],
    },
    permissions: {
      type: [String],
      required: true,
      default: [],
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    inviteToken: {
      type: String,
      trim: true,
      default: null,
    },
    inviteSentAt: {
      type: Date,
      default: null,
    },
    passwordHash: {
      type: String,
      trim: true,
      default: null,
    },
    passwordSalt: {
      type: String,
      trim: true,
      default: null,
    },
    passwordUpdatedAt: {
      type: Date,
      default: null,
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

teamMemberSchema.index({ merchantId: 1, email: 1 }, { unique: true });
teamMemberSchema.index({ merchantId: 1, role: 1, status: 1 });
teamMemberSchema.index(
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

type TeamMemberEntry = InferSchemaType<typeof teamMemberSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type TeamMemberDocument = TeamMemberEntry;

export const TeamMemberModel =
  (models.TeamMember as Model<TeamMemberDocument> | undefined) ??
  model<TeamMemberDocument>("TeamMember", teamMemberSchema);
