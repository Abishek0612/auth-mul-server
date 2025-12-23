import { Response, NextFunction } from "express";
import Joi from "joi";
import { AuthRequest } from "../interface/request.interface";
import UserService from "../services/user.services";
import { catchAsync } from "../utils/catchAsync";
import { validate } from "../middlewear/validation.middlewear";

// Validation schema
export const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50),
});

export default class UserController {
  /**
   * Get current user profile
   * @route GET /api/users/me
   */
  static getCurrentUser = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      res.status(200).json({
        success: true,
        data: req.user,
      });
    }
  );

  /**
   * Update user profile
   * @route PUT /api/users/me
   */
  static updateProfile = [
    validate(updateProfileSchema),
    catchAsync(async (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const updatedUser = await UserService.updateUserProfile(
        req.user._id.toString(),
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updatedUser,
      });
    }),
  ];
}
