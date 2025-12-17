import mongoose, { Document, Schema } from "mongoose";

export interface IUboardSiteMaster extends Document {
  siteCode: string;
  siteName: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const uboardSiteMasterSchema = new Schema<IUboardSiteMaster>(
  {
    siteCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    siteName: {
      type: String,
      required: true,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret._id = ret._id.toString();
        return ret;
      },
    },
  }
);

uboardSiteMasterSchema.index({ siteCode: 1, active: 1 });

export default mongoose.model<IUboardSiteMaster>(
  "UboardSiteMaster",
  uboardSiteMasterSchema
);
