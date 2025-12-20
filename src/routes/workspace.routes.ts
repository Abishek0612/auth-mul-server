import { Router } from "express";
import { authenticateUser } from "../middlewear/auth.middlewear";
import { WorkspaceController } from "../controllers/workspace.controller";

const router = Router();

router.use(authenticateUser);

router.get("/po", WorkspaceController.getPOWorkspace);
router.get("/invoice", WorkspaceController.getInvoiceWorkspace);
router.get("/grn", WorkspaceController.getGRNWorkspace);

export default router;
