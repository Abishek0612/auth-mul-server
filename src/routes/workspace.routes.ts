import { Router } from "express";
import { authenticateUser } from "../middlewear/auth.middlewear";
import { WorkspaceController } from "../controllers/workspace.controller";

const router = Router();

router.use(authenticateUser);

router.get("/po", WorkspaceController.getPOWorkspace);
router.get("/invoice", WorkspaceController.getInvoiceWorkspace);
router.get("/grn", WorkspaceController.getGRNWorkspace);

router.get("/po/:poId", WorkspaceController.getPODetails);
router.get("/po/:poId", WorkspaceController.getPODetails);
router.get("/invoice/:invoiceId", WorkspaceController.getInvoiceDetails);
router.get("/grn/:grnId", WorkspaceController.getGRNDetails);

export default router;
