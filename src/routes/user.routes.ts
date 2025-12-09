import { Router } from "express";
import UserController from "../controllers/user.controllers";
import { authenticateUser } from "../middlewear/auth.middlewear";

const router = Router();

router.use(authenticateUser);

router.get("/me", UserController.getCurrentUser);
router.put("/me", UserController.updateProfile);

export default router;
