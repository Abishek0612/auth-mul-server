import mongoose, { Document, Schema } from "mongoose";

export interface IGRN extends Document {
  document_type: string;
  s3_key: string;
  organization: mongoose.Types.ObjectId;
  uploaded_by: mongoose.Types.ObjectId;
  grn_data: any;
  status: string;
  file_name: string;
  approval_date?: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const grnSchema = new Schema<IGRN>(
  {
    document_type: {
      type: String,
      required: true,
      trim: true,
      default: "GRN",
    },
    s3_key: {
      type: String,
      required: true,
      trim: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    uploaded_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    grn_data: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending-approval", "approved", "rejected", "ocr-running"],
      default: "pending-approval",
    },
    file_name: {
      type: String,
      required: true,
      trim: true,
    },
    approval_date: {
      type: Date,
      default: null,
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
        if (ret.organization) ret.organization = ret.organization.toString();
        if (ret.uploaded_by) ret.uploaded_by = ret.uploaded_by.toString();
        return ret;
      },
    },
    toObject: {
      transform: (doc, ret) => {
        ret._id = ret._id.toString();
        if (ret.organization) ret.organization = ret.organization.toString();
        if (ret.uploaded_by) ret.uploaded_by = ret.uploaded_by.toString();
        return ret;
      },
    },
  }
);

export default mongoose.model<IGRN>("GRN", grnSchema);
