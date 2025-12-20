import { Request } from "express";

export interface IOrganization {
  _id: string;
  name: string;
  code: string;
}

export interface IAuthUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organization: string | IOrganization;
  role: string;
  status: string;
  isFirstLogin: boolean;
  resetPasswordCode?: string;
  resetPasswordCodeExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest extends Request {
  user?: IAuthUser;
  file?: Express.Multer.File;
}
