import { Request, Response } from "express";
import DocumentService from "../services/document.service";
import { catchAsync } from "../utils/catchAsync";
import { AuthRequest, IOrganization } from "../interface/request.interface";
import multer from "multer";
import { BadRequestError } from "../utils/api-errors";
import Invoice from "../models/invoice.model";
import PurchaseOrder from "../models/purchaseorder.model";
import GRN from "../models/grn.model";
import PaymentAdvice from "../models/paymentadvice.model";
import { isValidObjectId, extractObjectIdString } from "../utils/objectIdUtils";
import S3Service from "../services/s3.service";

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only images and PDF files are allowed") as any, false);
    }
  },
}).single("file");

interface AuthRequestWithFile extends AuthRequest {
  file?: Express.Multer.File;
}

const getOrganizationData = (
  organization: any
): { id: string; code: string } => {
  if (!organization) {
    return { id: "", code: "KIWI" };
  }

  if (typeof organization === "object" && organization.code) {
    return {
      id: extractObjectIdString(organization._id || organization),
      code: organization.code || "KIWI",
    };
  }

  return {
    id: extractObjectIdString(organization),
    code: "KIWI",
  };
};

const checkForDuplicateFile = async (
  fileName: string,
  documentType: string,
  organizationId: string
): Promise<boolean> => {
  const query = {
    file_name: fileName,
    organization: organizationId,
    active: true,
  };

  let existingDocument;

  switch (documentType.toLowerCase()) {
    case "invoice":
      existingDocument = await Invoice.findOne({
        ...query,
        document_type: documentType,
      });
      break;
    case "purchase order":
      existingDocument = await PurchaseOrder.findOne(query);
      break;
    case "grn":
      existingDocument = await GRN.findOne(query);
      break;
    case "payment advice":
      existingDocument = await PaymentAdvice.findOne(query);
      break;
    default:
      existingDocument = await Invoice.findOne({
        ...query,
        document_type: documentType,
      });
      break;
  }

  return !!existingDocument;
};

export default class DocumentController {
  static generatePresignedUploadUrl = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { fileName, contentType, documentType } = req.query;

      if (!fileName || !contentType || !documentType) {
        return res.status(400).json({
          success: false,
          message: "fileName, contentType, and documentType are required",
        });
      }

      const userId = extractObjectIdString(req.user._id);
      const { id: organizationId } = getOrganizationData(req.user.organization);

      if (!isValidObjectId(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      if (!isValidObjectId(organizationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }

      const isDuplicate = await checkForDuplicateFile(
        fileName as string,
        documentType as string,
        organizationId
      );

      if (isDuplicate) {
        return res.status(400).json({
          success: false,
          message: `File "${fileName}" already exists for document type "${documentType}". Please use a different file name.`,
        });
      }

      const { uploadUrl, key, expiresAt } =
        S3Service.generatePresignedUploadUrl(
          fileName as string,
          contentType as string,
          300
        );

      res.status(200).json({
        success: true,
        data: {
          uploadUrl,
          key,
          fileName: fileName as string,
          expiresAt: expiresAt.toISOString(),
          expiresIn: 300,
        },
      });
    }
  );

  static uploadDocument = [
    (req: Request, res: Response, next: Function) => {
      upload(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return next(new BadRequestError("File size cannot exceed 15MB"));
          }
          return next(new BadRequestError(err.message));
        }
        next();
      });
    },
    catchAsync(async (req: AuthRequestWithFile, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const { documentType } = req.body;
      if (!documentType) {
        return res.status(400).json({
          success: false,
          message: "Document type is required",
        });
      }

      const userId = extractObjectIdString(req.user._id);
      const { id: organizationId } = getOrganizationData(req.user.organization);

      if (!isValidObjectId(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      if (!isValidObjectId(organizationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }

      const isDuplicate = await checkForDuplicateFile(
        req.file.originalname,
        documentType,
        organizationId
      );

      if (isDuplicate) {
        return res.status(400).json({
          success: false,
          message: `File "${req.file.originalname}" already exists for document type "${documentType}". Please use a different file name.`,
        });
      }

      const document = await DocumentService.uploadDocument(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        userId,
        organizationId,
        documentType
      );

      res.status(201).json({
        success: true,
        message: `${documentType} uploaded successfully`,
        data: document,
      });
    }),
  ];

  static getDocuments = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;

    const { id: organizationId } = getOrganizationData(req.user.organization);

    if (!isValidObjectId(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
    }

    const result = await DocumentService.getAllDocumentsByOrganization(
      organizationId,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      data: result.documents,
      pagination: {
        total: result.total,
        page: result.page,
        pages: result.pages,
        limit,
      },
    });
  });

  static getDocumentById = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;
      const { type } = req.query;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: "Document type query parameter is required",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const document = await DocumentService.getDocumentById(
        id,
        type as string
      );

      res.status(200).json({
        success: true,
        data: document,
      });
    }
  );

  static deleteDocument = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;
      const { type } = req.query;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: "Document type query parameter is required",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      await DocumentService.deleteDocument(id, type as string);

      res.status(200).json({
        success: true,
        message: "Document deleted successfully",
      });
    }
  );

  static updateStatus = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { status, type } = req.body;

    if (!status || !type) {
      return res.status(400).json({
        success: false,
        message: "Status and type are required",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID",
      });
    }

    try {
      const document = await DocumentService.updateDocumentStatus(
        id,
        status,
        type
      );

      res.status(200).json({
        success: true,
        message: "Document status updated successfully",
        data: document,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update document status",
      });
    }
  });

  static updateDocumentData = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;
      const { data, type } = req.body;

      if (!data || !type) {
        return res.status(400).json({
          success: false,
          message: "Document data and type are required",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      try {
        const document = await DocumentService.updateDocumentData(
          id,
          type,
          data
        );

        res.status(200).json({
          success: true,
          message: "Document data updated successfully",
          data: document,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message || "Failed to update document data",
        });
      }
    }
  );

  static exportDocuments = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { documentIds } = req.body;

      if (
        !documentIds ||
        !Array.isArray(documentIds) ||
        documentIds.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Document IDs are required",
        });
      }

      for (const id of documentIds) {
        if (!isValidObjectId(id)) {
          return res.status(400).json({
            success: false,
            message: `Invalid document ID: ${id}`,
          });
        }
      }

      const { id: organizationId, code: organizationCode } =
        getOrganizationData(req.user.organization);

      if (!isValidObjectId(organizationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }

      try {
        const excelBuffer = await DocumentService.exportDocumentsToExcel(
          documentIds,
          organizationId,
          organizationCode
        );

        const documents = await Promise.all(
          documentIds.map(async (id) => {
            const [invoice, purchaseOrder, grn, paymentAdvice] =
              await Promise.all([
                Invoice.findById(id).lean(),
                PurchaseOrder.findById(id).lean(),
                GRN.findById(id).lean(),
                PaymentAdvice.findById(id).lean(),
              ]);
            return invoice || purchaseOrder || grn || paymentAdvice;
          })
        );

        const validDocs = documents.filter((doc) => doc);
        const types = [
          ...new Set(
            validDocs.map(
              (doc) =>
                doc.document_type?.toLowerCase().replace(/\s+/g, "_") ||
                "document"
            )
          ),
        ];

        const documentType = types.length === 1 ? types[0] : "mixed_documents";
        const timestamp = new Date().toISOString().split("T")[0];
        const filename = `${documentType}_export_${timestamp}.xlsx`;

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        res.setHeader("Content-Length", excelBuffer.length);

        res.send(excelBuffer);
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message || "Failed to export documents",
        });
      }
    }
  );

  static getDocumentWithValidation = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;
      const { type } = req.query;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: "Document type query parameter is required",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      let document;

      if (type.toString().toLowerCase() === "purchase order") {
        const PurchaseOrderService =
          require("../services/purchaseorder.service").default;
        document = await PurchaseOrderService.getPurchaseOrderWithValidation(
          id
        );
        document.document_type = "Purchase Order";
      } else {
        document = await DocumentService.getDocumentById(id, type as string);
      }

      res.status(200).json({
        success: true,
        data: document,
      });
    }
  );

  static reScanDocument = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;
      const { type } = req.body;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: "Document type is required",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      try {
        await DocumentService.reScanDocument(id, type);

        res.status(200).json({
          success: true,
          message: "Document re-scan started successfully",
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message || "Failed to start document re-scan",
        });
      }
    }
  );

  static checkDocumentDuplicates = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;
      const { type } = req.query;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: "Document type query parameter is required",
        });
      }

      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const { id: organizationId } = getOrganizationData(req.user.organization);

      if (!isValidObjectId(organizationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }

      try {
        const duplicateResult = await DocumentService.checkDocumentDuplicates(
          id,
          type as string,
          organizationId
        );

        res.status(200).json({
          success: true,
          data: duplicateResult,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message || "Failed to check document duplicates",
        });
      }
    }
  );
}
