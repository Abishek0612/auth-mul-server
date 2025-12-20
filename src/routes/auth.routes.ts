import { Router } from "express";
import AuthController from "../controllers/auth.controllers";
import { authenticateUser } from "../middlewear/auth.middlewear";

const router = Router();

// Login and token management
router.post("/login", AuthController.login);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logout);

router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);

// Protected routes
router.use(authenticateUser);
router.post("/change-password", AuthController.changeFirstTimePassword);

export default router;
