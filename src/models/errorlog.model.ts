import mongoose, { Document, Schema } from "mongoose";

export interface IErrorLog extends Document {
  timestamp: Date;
  level: string;
  message: string;
  stack?: string;
  url?: string;
  method?: string;
  statusCode?: number;
  userId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  additionalData?: any;
  createdAt: Date;
}

const errorLogSchema = new Schema<IErrorLog>(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    level: {
      type: String,
      enum: ["error", "warn", "fatal"],
      default: "error",
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    stack: {
      type: String,
    },
    url: {
      type: String,
    },
    method: {
      type: String,
    },
    statusCode: {
      type: Number,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
    },
    requestId: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    ip: {
      type: String,
    },
    additionalData: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

errorLogSchema.index({ timestamp: -1 });
errorLogSchema.index({ level: 1, timestamp: -1 });
errorLogSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model<IErrorLog>("ErrorLog", errorLogSchema);
