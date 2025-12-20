// src/routes/invoice.routes.ts
import { Router } from "express";
import InvoiceController from "../controllers/invoice.controller";
import { authenticateUser } from "../middlewear/auth.middlewear";

const router = Router();

router.use(authenticateUser);

router.post("/upload", InvoiceController.uploadInvoice);
router.get("/", InvoiceController.getInvoices);
router.get("/:id", InvoiceController.getInvoiceById);
router.delete("/:id", InvoiceController.deleteInvoice);
router.patch("/:id/status", InvoiceController.updateStatus);
router.put("/:id/data", InvoiceController.updateInvoiceData);

export default router;
