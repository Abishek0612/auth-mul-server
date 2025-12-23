import mongoose, { Document, Schema } from "mongoose";
import { Status } from "../interface/organization.interface";

export interface IOrganization extends Document {
  name: string;
  code: string;
  status: Status;
  invoice_prompt?: string;
  purchaseorder_prompt?: string;
  grn_prompt?: string;
  paymentadvice_prompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 20,
    },
    status: {
      type: String,
      enum: Object.values(Status),
      default: Status.ACTIVE,
    },
    invoice_prompt: {
      type: String,
      trim: true,
      default: null,
    },
    purchaseorder_prompt: {
      type: String,
      trim: true,
      default: null,
    },
    grn_prompt: {
      type: String,
      trim: true,
      default: null,
    },
    paymentadvice_prompt: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

organizationSchema.index({ name: 1 });

export default mongoose.model<IOrganization>(
  "Organization",
  organizationSchema
);
