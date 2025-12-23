import mongoose, { Document, Schema } from "mongoose";

export interface IUboardProductMaster extends Document {
  productName: string;
  productCategory: string;
  brand: string;
  baseCost: number;
  hsnCode: string;
  gstPercentage: number;
  eanCode: string;
  articleCode: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const uboardProductMasterSchema = new Schema<IUboardProductMaster>(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    productCategory: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    baseCost: {
      type: Number,
      required: true,
      min: 0,
    },
    hsnCode: {
      type: String,
      required: true,
      trim: true,
    },
    gstPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    eanCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    articleCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
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

uboardProductMasterSchema.index({ articleCode: 1, active: 1 });
uboardProductMasterSchema.index({ eanCode: 1, active: 1 });
uboardProductMasterSchema.index({ hsnCode: 1, active: 1 });

export default mongoose.model<IUboardProductMaster>(
  "UboardProductMaster",
  uboardProductMasterSchema
);
