import { Router } from "express";
import DocumentController from "../controllers/document.controller";
import { authenticateUser } from "../middlewear/auth.middlewear";

const router = Router();

router.use(authenticateUser);

router.get(
  "/generate-presigned-upload-url",
  DocumentController.generatePresignedUploadUrl
);
router.post("/upload", DocumentController.uploadDocument);
router.get("/", DocumentController.getDocuments);
router.get("/:id", DocumentController.getDocumentById);
router.delete("/:id", DocumentController.deleteDocument);
router.patch("/:id/status", DocumentController.updateStatus);
router.put("/:id/data", DocumentController.updateDocumentData);
router.post("/export", DocumentController.exportDocuments);
router.post("/:id/re-scan", DocumentController.reScanDocument);
router.get("/:id/check-duplicates", DocumentController.checkDocumentDuplicates);

export default router;
