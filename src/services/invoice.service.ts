import Invoice from "../models/invoice.model";
import Organization from "../models/organization.model";
import S3Service from "./s3.service";
import GeminiService from "./gemini.service";
import { NotFoundError } from "../utils/api-errors";
import { Types } from "mongoose";
import logger from "../config/logger";
import {
  isValidObjectId,
  toObjectId,
  extractObjectIdString,
} from "../utils/objectIdUtils";

class InvoiceService {
  async uploadInvoice(
    file: Buffer,
    fileName: string,
    fileType: string,
    userId: string,
    organizationId: string,
    documentType: string
  ): Promise<any> {
    logger.info(`Uploading ${documentType}: ${fileName}`);

    if (!isValidObjectId(userId)) {
      throw new Error(`Invalid user ID: ${userId}`);
    }

    if (!isValidObjectId(organizationId)) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    const s3Key = await S3Service.uploadFile(file, fileName, fileType);
    logger.info(`File uploaded to S3 with key: ${s3Key}`);

    const invoice = await Invoice.create({
      document_type: documentType,
      s3_key: s3Key,
      organization: toObjectId(organizationId),
      uploaded_by: toObjectId(userId),
      file_name: fileName,
      status: "pending-approval",
      active: true,
    });

    logger.info(
      `${documentType} record created in MongoDB with ID: ${invoice._id}`
    );

    this.processInvoiceExtraction(
      invoice._id.toString(),
      s3Key,
      organizationId,
      documentType
    ).catch((err) => {
      logger.error(
        `Error processing ${documentType} extraction for ${invoice._id}:`,
        err
      );
    });

    return invoice.toObject();
  }

  private async processInvoiceExtraction(
    invoiceId: string,
    s3Key: string,
    organizationId: string,
    documentType: string
  ): Promise<void> {
    try {
      logger.info(
        `Starting extraction process for ${documentType} ${invoiceId}`
      );

      if (!isValidObjectId(invoiceId)) {
        throw new Error(`Invalid invoice ID for extraction: ${invoiceId}`);
      }

      if (!isValidObjectId(organizationId)) {
        throw new Error(
          `Invalid organization ID for extraction: ${organizationId}`
        );
      }

      await Invoice.findByIdAndUpdate(toObjectId(invoiceId), {
        status: "ocr-running",
      });

      const organization = await Organization.findById(
        toObjectId(organizationId)
      );

      if (!organization) {
        logger.warn(`Organization not found for ID: ${organizationId}`);
      }

      let customPrompt;
      if (documentType.toLowerCase() === "purchase order") {
        customPrompt = organization?.purchaseorder_prompt || undefined;
      } else {
        customPrompt = organization?.invoice_prompt || undefined;
      }

      logger.info(
        `Using ${
          customPrompt ? "custom" : "default"
        } prompt for ${documentType} - organization: ${
          organization?.name || "Unknown"
        }`
      );

      const extractedData = await GeminiService.extractInvoiceData(
        s3Key,
        customPrompt,
        documentType
      );

      logger.info(
        `Data extracted successfully for ${documentType} ${invoiceId}`
      );

      await Invoice.findByIdAndUpdate(toObjectId(invoiceId), {
        invoice_data: extractedData,
        status: "pending-approval",
      });

      logger.info(`${documentType} ${invoiceId} updated with extracted data`);
    } catch (error) {
      logger.error(
        `${documentType} extraction failed for ${invoiceId}:`,
        error
      );

      if (isValidObjectId(invoiceId)) {
        await Invoice.findByIdAndUpdate(toObjectId(invoiceId), {
          status: "pending-approval",
          invoice_data: {
            error: "Extraction failed",
            errorDetails: error.message,
          },
        });
      }
    }
  }

  async getInvoicesByOrganization(organizationId: string): Promise<any[]> {
    if (!isValidObjectId(organizationId)) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    return Invoice.find({
      organization: toObjectId(organizationId),
      active: true,
    })
      .lean()
      .sort({ createdAt: -1 });
  }

  async getInvoicesByOrganizationPaginated(
    organizationId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ documents: any[]; total: number }> {
    if (!isValidObjectId(organizationId)) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      Invoice.find({
        organization: toObjectId(organizationId),
        active: true,
      })
        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Invoice.countDocuments({
        organization: toObjectId(organizationId),
        active: true,
      }),
    ]);

    return { documents, total };
  }

  async getInvoiceById(invoiceId: string): Promise<any> {
    if (!isValidObjectId(invoiceId)) {
      throw new Error(`Invalid invoice ID: ${invoiceId}`);
    }

    const invoice = await Invoice.findOne({
      _id: toObjectId(invoiceId),
      active: true,
    }).lean();

    if (!invoice) {
      throw new NotFoundError("Document not found");
    }

    return invoice;
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    if (!isValidObjectId(invoiceId)) {
      throw new Error(`Invalid invoice ID: ${invoiceId}`);
    }

    const invoice = await Invoice.findByIdAndUpdate(
      toObjectId(invoiceId),
      { active: false },
      { new: true }
    ).lean();

    if (!invoice) {
      throw new NotFoundError("Document not found");
    }

    logger.info(`Document soft deleted: ${invoiceId}`);
  }

  async updateInvoiceStatus(
    invoiceId: string,
    status: string,
    updateData?: any
  ): Promise<any> {
    if (!isValidObjectId(invoiceId)) {
      throw new Error(`Invalid invoice ID: ${invoiceId}`);
    }

    const updateFields = updateData || { status };

    const invoice = await Invoice.findByIdAndUpdate(
      toObjectId(invoiceId),
      updateFields,
      { new: true }
    ).lean();

    if (!invoice) {
      throw new NotFoundError("Document not found");
    }

    logger.info(
      `Document status updated to ${status} for document: ${invoiceId}`
    );
    return invoice;
  }

  async updateInvoiceData(invoiceId: string, invoiceData: any): Promise<any> {
    logger.info(`Updating document data for: ${invoiceId}`);

    if (!isValidObjectId(invoiceId)) {
      throw new Error(`Invalid invoice ID: ${invoiceId}`);
    }

    const invoice = await Invoice.findByIdAndUpdate(
      toObjectId(invoiceId),
      { invoice_data: invoiceData },
      { new: true }
    ).lean();

    if (!invoice) {
      throw new NotFoundError("Document not found");
    }

    logger.info(`Document data updated successfully: ${invoiceId}`);
    return invoice;
  }

  async getInvoiceWithOrganization(invoiceId: string): Promise<any> {
    if (!isValidObjectId(invoiceId)) {
      throw new Error(`Invalid invoice ID: ${invoiceId}`);
    }

    const invoice = await Invoice.findOne({
      _id: toObjectId(invoiceId),
      active: true,
    })
      .populate("organization", "name code invoice_prompt purchaseorder_prompt")
      .lean();

    if (!invoice) {
      throw new NotFoundError("Document not found");
    }

    return invoice;
  }

  async getInvoicesWithOrganization(organizationId: string): Promise<any[]> {
    if (!isValidObjectId(organizationId)) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    return Invoice.find({
      organization: toObjectId(organizationId),
      active: true,
    })
      .populate("organization", "name code invoice_prompt purchaseorder_prompt")
      .lean()
      .sort({ createdAt: -1 });
  }

  async reprocessInvoiceExtraction(invoiceId: string): Promise<any> {
    if (!isValidObjectId(invoiceId)) {
      throw new Error(`Invalid invoice ID: ${invoiceId}`);
    }

    const invoice = await Invoice.findById(toObjectId(invoiceId));

    if (!invoice) {
      throw new NotFoundError("Document not found");
    }

    logger.info(`Re-processing document extraction for: ${invoiceId}`);

    this.processInvoiceExtraction(
      invoiceId,
      invoice.s3_key,
      invoice.organization.toString(),
      invoice.document_type
    ).catch((err) => {
      logger.error(
        `Error re-processing document extraction for ${invoiceId}:`,
        err
      );
    });

    return { success: true, message: "Re-processing started" };
  }

  async reScanInvoice(invoiceId: string): Promise<void> {
    if (!isValidObjectId(invoiceId)) {
      throw new Error(`Invalid invoice ID: ${invoiceId}`);
    }

    const invoice = await Invoice.findById(toObjectId(invoiceId)).populate(
      "organization"
    );

    if (!invoice) {
      throw new NotFoundError("Document not found");
    }

    logger.info(`Re-scanning invoice: ${invoiceId}`);

    await Invoice.findByIdAndUpdate(toObjectId(invoiceId), {
      status: "ocr-running",
      invoice_data: null,
    });

    this.processInvoiceExtraction(
      invoiceId,
      invoice.s3_key,
      invoice.organization._id.toString(),
      invoice.document_type
    ).catch((err) => {
      logger.error(`Error re-scanning invoice ${invoiceId}:`, err);
    });
  }

  async getOrganizationPrompt(
    organizationId: string,
    documentType: string
  ): Promise<string | null> {
    if (!isValidObjectId(organizationId)) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    const organization = await Organization.findById(
      toObjectId(organizationId)
    );

    if (documentType.toLowerCase() === "purchase order") {
      return organization?.purchaseorder_prompt || null;
    }

    return organization?.invoice_prompt || null;
  }

  async updateOrganizationPrompt(
    organizationId: string,
    prompt: string,
    documentType: string
  ): Promise<any> {
    if (!isValidObjectId(organizationId)) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }
    const updateField =
      documentType.toLowerCase() === "purchase order"
        ? { purchaseorder_prompt: prompt }
        : { invoice_prompt: prompt };

    const organization = await Organization.findByIdAndUpdate(
      toObjectId(organizationId),
      updateField,
      { new: true }
    );

    if (!organization) {
      throw new NotFoundError("Organization not found");
    }

    logger.info(
      `Updated ${documentType} prompt for organization: ${organization.name}`
    );
    return organization;
  }
}

export default new InvoiceService();
