import { Request, Response } from "express";
import Joi from "joi";
import { validate } from "../middlewear/validation.middlewear";
import AuthService from "../services/auth.services";
import { catchAsync } from "../utils/catchAsync";
import { AuthRequest } from "../interface/request.interface";

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string()
    .required()
    .length(5)
    .pattern(/^[0-9]+$/),
  password: Joi.string().required().min(6).max(50),
});

export const changePasswordSchema = Joi.object({
  password: Joi.string().required().min(5).max(50),
});

export default class AuthController {
  /**
   * Login user
   * @route POST /api/auth/login
   */
  static login = [
    validate(loginSchema),
    catchAsync(async (req: Request, res: Response) => {
      const result = await AuthService.login(req.body);

      res.cookie("refreshToken", result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: "strict",
      });

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          accessToken: result.tokens.accessToken,
          isFirstLogin: result.isFirstLogin,
          userId: result.userId,
        },
      });
    }),
  ];

  /**
   * Change first-time password
   * @route POST /api/auth/change-password
   */
  static changeFirstTimePassword = [
    validate(changePasswordSchema),
    catchAsync(async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const result = await AuthService.changeFirstTimePassword(
        req.user._id.toString(),
        req.body.password
      );

      res.status(200).json({
        success: true,
        message: "Password changed successfully",
        data: result,
      });
    }),
  ];

  /**
   * Forgot password
   * @route POST /api/auth/forgot-password
   */
  static forgotPassword = [
    validate(forgotPasswordSchema),
    catchAsync(async (req: Request, res: Response) => {
      const result = await AuthService.forgotPassword(req.body.email);
      res.status(200).json({
        success: true,
        message: "Password reset instructions sent to your email",
        data: result,
      });
    }),
  ];

  /**
   * Reset password
   * @route POST /api/auth/reset-password
   */
  static resetPassword = [
    validate(resetPasswordSchema),
    catchAsync(async (req: Request, res: Response) => {
      const result = await AuthService.resetPassword(req.body);
      res.status(200).json({
        success: true,
        message: "Password reset successful",
        data: result,
      });
    }),
  ];

  /**
   * Refresh token
   * @route POST /api/auth/refresh-token
   */
  static refreshToken = [
    catchAsync(async (req: Request, res: Response) => {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: "Refresh token is required",
        });
      }
      const tokens = await AuthService.refreshToken(refreshToken);

      res.cookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: "strict",
      });

      res.status(200).json({
        success: true,
        message: "Token refreshed successfully",
        data: { accessToken: tokens.accessToken },
      });
    }),
  ];

  /**
   * Logout user
   * @route POST /api/auth/logout
   */
  static logout = catchAsync(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    res.clearCookie("refreshToken");

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  });
}
