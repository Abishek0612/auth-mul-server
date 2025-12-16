import { Request, Response } from "express";
import InvoiceService from "../services/invoice.service";
import { catchAsync } from "../utils/catchAsync";
import { AuthRequest } from "../interface/request.interface";
import multer from "multer";
import { BadRequestError } from "../utils/api-errors";

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

export default class InvoiceController {
  static uploadInvoice = [
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

      const invoice = await InvoiceService.uploadInvoice(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.user._id.toString(),
        req.user.organization.toString(),
        documentType
      );

      res.status(201).json({
        success: true,
        message: "Invoice uploaded successfully",
        data: invoice,
      });
    }),
  ];

  static getInvoices = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const invoices = await InvoiceService.getInvoicesByOrganization(
      req.user.organization.toString()
    );

    res.status(200).json({
      success: true,
      data: invoices,
    });
  });

  static getInvoiceById = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;

      const invoice = await InvoiceService.getInvoiceWithOrganization(id);

      res.status(200).json({
        success: true,
        data: invoice,
      });
    }
  );

  static deleteInvoice = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    await InvoiceService.deleteInvoice(id);

    res.status(200).json({
      success: true,
      message: "Invoice deleted successfully",
    });
  });

  static updateStatus = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const invoice = await InvoiceService.updateInvoiceStatus(id, status);

    res.status(200).json({
      success: true,
      message: "Invoice status updated successfully",
      data: invoice,
    });
  });

  static updateInvoiceData = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const { id } = req.params;
      const invoiceData = req.body;

      if (!invoiceData) {
        return res.status(400).json({
          success: false,
          message: "Invoice data is required",
        });
      }

      const invoice = await InvoiceService.updateInvoiceData(id, invoiceData);

      res.status(200).json({
        success: true,
        message: "Invoice data updated successfully",
        data: invoice,
      });
    }
  );
}
