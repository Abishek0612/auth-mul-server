import { Router } from "express";
import WorkspaceController from "../controllers/workspace.controller";
import { authenticateUser } from "../middlewear/auth.middlewear";

const router = Router();

router.use(authenticateUser);

router.get("/po", WorkspaceController.getPOWorkspace);
router.get("/po/:poId", WorkspaceController.getPODetails);
router.get("/invoice", WorkspaceController.getInvoiceWorkspace);
router.get("/grn", WorkspaceController.getGRNWorkspace);

export default router;
