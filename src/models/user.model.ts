import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { Status, UserRole } from "../interface/user.interface";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organization: mongoose.Types.ObjectId;
  role: UserRole;
  status: Status;
  isFirstLogin: boolean;
  resetPasswordCode?: string;
  resetPasswordCodeExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
  compareResetCode(code: string): Promise<boolean>;
}

export type UserDocument = Document & IUser & IUserMethods;

const userSchema = new Schema<IUser, {}, IUserMethods>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 5,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(Status),
      default: Status.ACTIVE,
      required: true,
    },
    isFirstLogin: {
      type: Boolean,
      default: true,
    },
    resetPasswordCode: {
      type: String,
    },
    resetPasswordCodeExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error as Error);
    }
  }

  if (this.isModified("resetPasswordCode") && this.resetPasswordCode) {
    try {
      const salt = await bcrypt.genSalt(8);
      this.resetPasswordCode = await bcrypt.hash(this.resetPasswordCode, salt);
    } catch (error) {
      return next(error as Error);
    }
  }

  next();
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.compareResetCode = async function (
  candidateCode: string
): Promise<boolean> {
  if (!this.resetPasswordCode) return false;
  return bcrypt.compare(candidateCode, this.resetPasswordCode);
};

export default mongoose.model<IUser, mongoose.Model<IUser, {}, IUserMethods>>(
  "User",
  userSchema
);
