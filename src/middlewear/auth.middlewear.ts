import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "../utils/api-errors";
import User from "../models/user.model";
import Organization from "../models/organization.model";
import { environment } from "../config/environment";
import {
  AuthRequest,
  IAuthUser,
  IOrganization,
} from "../interface/request.interface";
import { TokenPayload, UserRole } from "../interface/user.interface";
import { isValidObjectId, extractObjectIdString } from "../utils/objectIdUtils";

export const authenticateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authentication required");
    }

    const token = authHeader.split(" ")[1];

    const payload = jwt.verify(
      token,
      environment.jwtAccessSecret
    ) as TokenPayload;

    if (!payload.userId || !isValidObjectId(payload.userId)) {
      throw new UnauthorizedError("Invalid user ID in token");
    }

    if (payload.role !== UserRole.SUPER_ADMIN && payload.organization) {
      if (!isValidObjectId(payload.organization)) {
        throw new UnauthorizedError("Invalid organization ID in token");
      }

      const organization = await Organization.findById(payload.organization);

      if (!organization || organization.status !== "active") {
        throw new UnauthorizedError("Organization not found or inactive");
      }
    }

    const user = await User.findById(payload.userId)
      .select("-password")
      .populate("organization", "name code");

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    const userObj = user.toObject();

    const userId = extractObjectIdString(userObj._id);
    if (!isValidObjectId(userId)) {
      throw new UnauthorizedError("Invalid user ObjectId");
    }

    let organizationData: string | IOrganization = "";

    if (userObj.organization) {
      if (
        typeof userObj.organization === "object" &&
        userObj.organization !== null &&
        "_id" in userObj.organization
      ) {
        const populatedOrg = userObj.organization as any;
        const orgId = extractObjectIdString(populatedOrg._id);

        if (!isValidObjectId(orgId)) {
          throw new UnauthorizedError("Invalid organization ObjectId");
        }

        organizationData = {
          _id: orgId,
          name: populatedOrg.name || "",
          code: populatedOrg.code || "KIWI",
        } as IOrganization;
      } else {
        const orgId = extractObjectIdString(userObj.organization);
        if (orgId && !isValidObjectId(orgId)) {
          throw new UnauthorizedError("Invalid organization ObjectId");
        }
        organizationData = orgId;
      }
    }

    const cleanUser: IAuthUser = {
      _id: userId,
      firstName: userObj.firstName,
      lastName: userObj.lastName,
      email: userObj.email,
      password: userObj.password,
      organization: organizationData,
      role: userObj.role,
      status: userObj.status,
      isFirstLogin: userObj.isFirstLogin,
      resetPasswordCode: userObj.resetPasswordCode,
      resetPasswordCodeExpires: userObj.resetPasswordCodeExpires,
      createdAt: userObj.createdAt,
      updatedAt: userObj.updatedAt,
    };

    req.user = cleanUser;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError("Invalid or expired token"));
    } else {
      next(error);
    }
  }
};

export const requireRole = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    if (!roles.includes(req.user.role as UserRole)) {
      return next(
        new ForbiddenError("You don't have permission to access this resource")
      );
    }

    next();
  };
};
