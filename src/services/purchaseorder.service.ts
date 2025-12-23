import PurchaseOrder from "../models/purchaseorder.model";
import Organization from "../models/organization.model";
import S3Service from "./s3.service";
import GeminiService from "./gemini.service";
import { NotFoundError } from "../utils/api-errors";
import { Types } from "mongoose";
import ProductValidationService from "./product-validation.service";
import logger from "../config/logger";
import { extractObjectIdString } from "../utils/objectIdUtils";

interface ValidationResult {
  articleCode: string;
  isValid: boolean;
  mismatches: {
    field: string;
    expected: string | number;
    actual: string | number;
  }[];
  errors: string[];
}

interface SiteValidationResult {
  isValid: boolean;
  error?: string;
  extractedSite?: string;
}

interface PurchaseOrderWithValidation {
  [key: string]: any;
  validation_results?: ValidationResult[];
  site_validation?: SiteValidationResult;
}

class PurchaseOrderService {
  async uploadPurchaseOrder(
    file: Buffer,
    fileName: string,
    fileType: string,
    userId: string,
    organizationId: string
  ): Promise<any> {
    logger.info(`Uploading Purchase Order: ${fileName}`);

    const s3Key = await S3Service.uploadFile(file, fileName, fileType);
    logger.info(`File uploaded to S3 with key: ${s3Key}`);

    const purchaseOrder = await PurchaseOrder.create({
      document_type: "Purchase Order",
      s3_key: s3Key,
      organization: new Types.ObjectId(organizationId),
      uploaded_by: new Types.ObjectId(userId),
      file_name: fileName,
      status: "pending-approval",
      active: true,
    });

    logger.info(
      `Purchase Order record created in MongoDB with ID: ${purchaseOrder._id}`
    );

    this.processPurchaseOrderExtraction(
      extractObjectIdString(purchaseOrder._id),
      s3Key,
      organizationId
    ).catch((err) => {
      logger.error(
        `Error processing Purchase Order extraction for ${purchaseOrder._id}:`,
        err
      );
    });

    return purchaseOrder.toObject();
  }

  private async processPurchaseOrderExtraction(
    purchaseOrderId: string,
    s3Key: string,
    organizationId: string
  ): Promise<void> {
    try {
      logger.info(
        `Starting extraction process for Purchase Order ${purchaseOrderId}`
      );

      await PurchaseOrder.findByIdAndUpdate(purchaseOrderId, {
        status: "ocr-running",
      });

      const organization = await Organization.findById(organizationId);

      if (!organization) {
        logger.warn(`Organization not found for ID: ${organizationId}`);
      }

      const customPrompt = organization?.purchaseorder_prompt || undefined;

      logger.info(
        `Using ${
          customPrompt ? "custom" : "default"
        } prompt for Purchase Order - organization: ${
          organization?.name || "Unknown"
        }`
      );

      const extractedData = await GeminiService.extractInvoiceData(
        s3Key,
        customPrompt,
        "Purchase Order"
      );

      logger.info(
        `Data extracted successfully for Purchase Order ${purchaseOrderId}`
      );

      await PurchaseOrder.findByIdAndUpdate(purchaseOrderId, {
        purchase_order_data: extractedData,
        status: "pending-approval",
      });

      logger.info(
        `Purchase Order ${purchaseOrderId} updated with extracted data`
      );
    } catch (error) {
      logger.error(
        `Purchase Order extraction failed for ${purchaseOrderId}:`,
        error
      );
      await PurchaseOrder.findByIdAndUpdate(purchaseOrderId, {
        status: "pending-approval",
        purchase_order_data: {
          error: "Extraction failed",
          errorDetails: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async getPurchaseOrdersByOrganization(
    organizationId: string
  ): Promise<any[]> {
    return PurchaseOrder.find({
      organization: new Types.ObjectId(organizationId),
      active: true,
    })
      .lean()
      .sort({ createdAt: -1 });
  }

  async getPurchaseOrdersByOrganizationPaginated(
    organizationId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ documents: any[]; total: number }> {
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      PurchaseOrder.find({
        organization: new Types.ObjectId(organizationId),
        active: true,
      })
        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PurchaseOrder.countDocuments({
        organization: new Types.ObjectId(organizationId),
        active: true,
      }),
    ]);

    return { documents, total };
  }

  async getPurchaseOrderById(purchaseOrderId: string): Promise<any> {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: purchaseOrderId,
      active: true,
    }).lean();

    if (!purchaseOrder) {
      throw new NotFoundError("Purchase Order not found");
    }

    return purchaseOrder;
  }

  async deletePurchaseOrder(purchaseOrderId: string): Promise<void> {
    const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      purchaseOrderId,
      { active: false },
      { new: true }
    ).lean();

    if (!purchaseOrder) {
      throw new NotFoundError("Purchase Order not found");
    }

    logger.info(`Purchase Order soft deleted: ${purchaseOrderId}`);
  }

  async updatePurchaseOrderStatus(
    purchaseOrderId: string,
    status: string,
    updateData?: any
  ): Promise<any> {
    const updateFields = updateData || { status };

    const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      purchaseOrderId,
      updateFields,
      { new: true }
    ).lean();

    if (!purchaseOrder) {
      throw new NotFoundError("Purchase Order not found");
    }

    logger.info(
      `Purchase Order status updated to ${status} for Purchase Order: ${purchaseOrderId}`
    );
    return purchaseOrder;
  }

  async updatePurchaseOrderData(
    purchaseOrderId: string,
    purchaseOrderData: any
  ): Promise<any> {
    logger.info(`Updating Purchase Order data for: ${purchaseOrderId}`);

    const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      purchaseOrderId,
      { purchase_order_data: purchaseOrderData },
      { new: true }
    ).lean();

    if (!purchaseOrder) {
      throw new NotFoundError("Purchase Order not found");
    }

    logger.info(`Purchase Order data updated successfully: ${purchaseOrderId}`);
    return purchaseOrder;
  }

  async getPurchaseOrderWithOrganization(
    purchaseOrderId: string
  ): Promise<PurchaseOrderWithValidation> {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: purchaseOrderId,
      active: true,
    })
      .populate("organization", "name code")
      .lean();

    if (!purchaseOrder) {
      throw new NotFoundError("Purchase Order not found");
    }

    const result: PurchaseOrderWithValidation = { ...purchaseOrder };

    if (
      purchaseOrder.purchase_order_data &&
      purchaseOrder.purchase_order_data.items &&
      Array.isArray(purchaseOrder.purchase_order_data.items)
    ) {
      logger.info(
        `Validating PO items against product master for PO: ${purchaseOrderId}`
      );

      try {
        const validationResults =
          await ProductValidationService.validatePOItems(
            purchaseOrder.purchase_order_data.items
          );

        result.validation_results = validationResults;

        logger.info(`Validation completed for PO ${purchaseOrderId}`);
      } catch (error) {
        logger.error(
          `Error during PO validation for ${purchaseOrderId}:`,
          error
        );
        result.validation_results = [];
      }
    } else {
      result.validation_results = [];
    }

    if (
      purchaseOrder.purchase_order_data &&
      purchaseOrder.purchase_order_data.site
    ) {
      logger.info(
        `Validating Site Code for PO: ${purchaseOrderId}, Site: ${purchaseOrder.purchase_order_data.site}`
      );

      try {
        const siteValidation = await ProductValidationService.validateSiteCode(
          purchaseOrder.purchase_order_data.site
        );

        result.site_validation = siteValidation;

        logger.info(
          `Site validation completed for PO ${purchaseOrderId}: ${
            siteValidation.isValid ? "Valid" : "Invalid"
          }`
        );
      } catch (error) {
        logger.error(
          `Error during Site validation for ${purchaseOrderId}:`,
          error
        );
        result.site_validation = {
          isValid: false,
          error: `Site validation error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          extractedSite: purchaseOrder.purchase_order_data.site,
        };
      }
    }

    return result;
  }

  async getPurchaseOrderWithValidation(
    purchaseOrderId: string
  ): Promise<PurchaseOrderWithValidation> {
    const purchaseOrder = await PurchaseOrder.findOne({
      _id: purchaseOrderId,
      active: true,
    })
      .populate("organization", "name code")
      .lean();

    if (!purchaseOrder) {
      throw new NotFoundError("Purchase Order not found");
    }

    const result: PurchaseOrderWithValidation = {
      _id: purchaseOrder._id,
      document_type: purchaseOrder.document_type,
      s3_key: purchaseOrder.s3_key,
      organization: purchaseOrder.organization,
      uploaded_by: purchaseOrder.uploaded_by,
      purchase_order_data: purchaseOrder.purchase_order_data,
      status: purchaseOrder.status,
      file_name: purchaseOrder.file_name,
      approval_date: purchaseOrder.approval_date,
      active: purchaseOrder.active,
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
      __v: purchaseOrder.__v,
    };

    if (
      purchaseOrder.purchase_order_data &&
      purchaseOrder.purchase_order_data.items &&
      Array.isArray(purchaseOrder.purchase_order_data.items)
    ) {
      logger.info(
        `Validating PO items against product master for PO: ${purchaseOrderId}`
      );

      try {
        const validationResults =
          await ProductValidationService.validatePOItems(
            purchaseOrder.purchase_order_data.items
          );

        result.validation_results = validationResults.map((validation) => ({
          articleCode: validation.articleCode,
          isValid: validation.isValid,
          mismatches: validation.mismatches,
          errors: validation.errors,
        }));

        logger.info(`Validation completed for PO ${purchaseOrderId}`);
      } catch (error) {
        logger.error(
          `Error during PO validation for ${purchaseOrderId}:`,
          error
        );
        result.validation_results = [];
      }
    } else {
      result.validation_results = [];
    }

    if (
      purchaseOrder.purchase_order_data &&
      purchaseOrder.purchase_order_data.site
    ) {
      logger.info(
        `Validating Site Code for PO: ${purchaseOrderId}, Site: ${purchaseOrder.purchase_order_data.site}`
      );

      try {
        const siteValidation = await ProductValidationService.validateSiteCode(
          purchaseOrder.purchase_order_data.site
        );

        result.site_validation = siteValidation;

        logger.info(
          `Site validation completed for PO ${purchaseOrderId}: ${
            siteValidation.isValid ? "Valid" : "Invalid"
          }`
        );
      } catch (error) {
        logger.error(
          `Error during Site validation for ${purchaseOrderId}:`,
          error
        );
        result.site_validation = {
          isValid: false,
          error: `Site validation error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          extractedSite: purchaseOrder.purchase_order_data.site,
        };
      }
    }

    return result;
  }

  async reScanPurchaseOrder(purchaseOrderId: string): Promise<void> {
    const purchaseOrder = await PurchaseOrder.findById(
      purchaseOrderId
    ).populate("organization");

    if (!purchaseOrder) {
      throw new NotFoundError("Purchase Order not found");
    }

    logger.info(`Re-scanning Purchase Order: ${purchaseOrderId}`);

    await PurchaseOrder.findByIdAndUpdate(purchaseOrderId, {
      status: "ocr-running",
      purchase_order_data: null,
    });

    this.processPurchaseOrderExtraction(
      purchaseOrderId,
      purchaseOrder.s3_key,
      purchaseOrder.organization._id.toString()
    ).catch((err) => {
      logger.error(`Error re-scanning Purchase Order ${purchaseOrderId}:`, err);
    });
  }
}

export default new PurchaseOrderService();
