import GRN from "../models/grn.model";
import Organization from "../models/organization.model";
import S3Service from "./s3.service";
import GeminiService from "./gemini.service";
import { NotFoundError } from "../utils/api-errors";
import { Types } from "mongoose";
import logger from "../config/logger";
import { extractObjectIdString } from "../utils/objectIdUtils";

class GRNService {
  async uploadGRN(
    file: Buffer,
    fileName: string,
    fileType: string,
    userId: string,
    organizationId: string
  ): Promise<any> {
    logger.info(`Uploading GRN: ${fileName}`);

    const s3Key = await S3Service.uploadFile(file, fileName, fileType);
    logger.info(`File uploaded to S3 with key: ${s3Key}`);

    const grn = await GRN.create({
      document_type: "GRN",
      s3_key: s3Key,
      organization: new Types.ObjectId(organizationId),
      uploaded_by: new Types.ObjectId(userId),
      file_name: fileName,
      status: "pending-approval",
      active: true,
    });

    logger.info(`GRN record created in MongoDB with ID: ${grn._id}`);

    this.processGRNExtraction(
      extractObjectIdString(grn._id),
      s3Key,
      organizationId
    ).catch((err) => {
      logger.error(`Error processing GRN extraction for ${grn._id}:`, err);
    });

    return grn.toObject();
  }

  private async processGRNExtraction(
    grnId: string,
    s3Key: string,
    organizationId: string
  ): Promise<void> {
    try {
      logger.info(`Starting extraction process for GRN ${grnId}`);

      await GRN.findByIdAndUpdate(grnId, {
        status: "ocr-running",
      });

      const organization = await Organization.findById(organizationId);

      if (!organization) {
        logger.warn(`Organization not found for ID: ${organizationId}`);
      }

      const customPrompt = organization?.grn_prompt || undefined;

      logger.info(
        `Using ${
          customPrompt ? "custom" : "default"
        } prompt for GRN - organization: ${organization?.name || "Unknown"}`
      );

      const extractedData = await GeminiService.extractInvoiceData(
        s3Key,
        customPrompt,
        "GRN"
      );

      logger.info(`Data extracted successfully for GRN ${grnId}`);

      await GRN.findByIdAndUpdate(grnId, {
        grn_data: extractedData,
        status: "pending-approval",
      });

      logger.info(`GRN ${grnId} updated with extracted data`);
    } catch (error) {
      logger.error(`GRN extraction failed for ${grnId}:`, error);
      await GRN.findByIdAndUpdate(grnId, {
        status: "pending-approval",
        grn_data: {
          error: "Extraction failed",
          errorDetails: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async getGRNsByOrganization(organizationId: string): Promise<any[]> {
    return GRN.find({
      organization: new Types.ObjectId(organizationId),
      active: true,
    })
      .lean()
      .sort({ createdAt: -1 });
  }

  async getGRNsByOrganizationPaginated(
    organizationId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ documents: any[]; total: number }> {
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      GRN.find({
        organization: new Types.ObjectId(organizationId),
        active: true,
      })
        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GRN.countDocuments({
        organization: new Types.ObjectId(organizationId),
        active: true,
      }),
    ]);

    return { documents, total };
  }

  async getGRNById(grnId: string): Promise<any> {
    const grn = await GRN.findOne({
      _id: grnId,
      active: true,
    }).lean();

    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    return grn;
  }

  async deleteGRN(grnId: string): Promise<void> {
    const grn = await GRN.findByIdAndUpdate(
      grnId,
      { active: false },
      { new: true }
    ).lean();

    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    logger.info(`GRN soft deleted: ${grnId}`);
  }

  async updateGRNStatus(
    grnId: string,
    status: string,
    updateData?: any
  ): Promise<any> {
    const updateFields = updateData || { status };

    const grn = await GRN.findByIdAndUpdate(grnId, updateFields, {
      new: true,
    }).lean();

    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    logger.info(`GRN status updated to ${status} for GRN: ${grnId}`);
    return grn;
  }

  async updateGRNData(grnId: string, grnData: any): Promise<any> {
    logger.info(`Updating GRN data for: ${grnId}`);

    const grn = await GRN.findByIdAndUpdate(
      grnId,
      { grn_data: grnData },
      { new: true }
    ).lean();

    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    logger.info(`GRN data updated successfully: ${grnId}`);
    return grn;
  }

  async getGRNWithOrganization(grnId: string): Promise<any> {
    const grn = await GRN.findOne({
      _id: grnId,
      active: true,
    })
      .populate("organization", "name code grn_prompt")
      .lean();

    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    return grn;
  }

  async reScanGRN(grnId: string): Promise<void> {
    const grn = await GRN.findById(grnId).populate("organization");

    if (!grn) {
      throw new NotFoundError("GRN not found");
    }

    logger.info(`Re-scanning GRN: ${grnId}`);

    await GRN.findByIdAndUpdate(grnId, {
      status: "ocr-running",
      grn_data: null,
    });

    this.processGRNExtraction(
      grnId,
      grn.s3_key,
      grn.organization._id.toString()
    ).catch((err) => {
      logger.error(`Error re-scanning GRN ${grnId}:`, err);
    });
  }
}

export default new GRNService();
