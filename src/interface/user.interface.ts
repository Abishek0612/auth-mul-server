import mongoose from "mongoose";

export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN",
}

export enum Status {
  ACTIVE = "active",
  INACTIVE = "inactive",
  DELETE = "delete",
}

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

export type UserDocument = Document & IUser;

export interface LoginInput {
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  email: string;
  otp: string;
  password: string;
}

export interface TokenPayload {
  userId: string;
  role: UserRole;
  organization?: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
