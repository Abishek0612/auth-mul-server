import PaymentAdvice from "../models/paymentadvice.model";
import Organization from "../models/organization.model";
import S3Service from "./s3.service";
import GeminiService from "./gemini.service";
import { NotFoundError } from "../utils/api-errors";
import { Types } from "mongoose";
import logger from "../config/logger";
import { extractObjectIdString } from "../utils/objectIdUtils";

class PaymentAdviceService {
  async uploadPaymentAdvice(
    file: Buffer,
    fileName: string,
    fileType: string,
    userId: string,
    organizationId: string
  ): Promise<any> {
    logger.info(`Uploading Payment Advice: ${fileName}`);

    const s3Key = await S3Service.uploadFile(file, fileName, fileType);
    logger.info(`File uploaded to S3 with key: ${s3Key}`);

    const paymentAdvice = await PaymentAdvice.create({
      document_type: "Payment Advice",
      s3_key: s3Key,
      organization: new Types.ObjectId(organizationId),
      uploaded_by: new Types.ObjectId(userId),
      file_name: fileName,
      status: "pending-approval",
      active: true,
    });

    logger.info(
      `Payment Advice record created in MongoDB with ID: ${paymentAdvice._id}`
    );

    this.processPaymentAdviceExtraction(
      extractObjectIdString(paymentAdvice._id),
      s3Key,
      organizationId
    ).catch((err) => {
      logger.error(
        `Error processing Payment Advice extraction for ${paymentAdvice._id}:`,
        err
      );
    });

    return paymentAdvice.toObject();
  }

  private async processPaymentAdviceExtraction(
    paymentAdviceId: string,
    s3Key: string,
    organizationId: string
  ): Promise<void> {
    try {
      logger.info(
        `Starting extraction process for Payment Advice ${paymentAdviceId}`
      );

      await PaymentAdvice.findByIdAndUpdate(paymentAdviceId, {
        status: "ocr-running",
      });

      const organization = await Organization.findById(organizationId);

      if (!organization) {
        logger.warn(`Organization not found for ID: ${organizationId}`);
      }

      const customPrompt = organization?.paymentadvice_prompt || undefined;

      logger.info(
        `Using ${
          customPrompt ? "custom" : "default"
        } prompt for Payment Advice - organization: ${
          organization?.name || "Unknown"
        }`
      );

      const extractedData = await GeminiService.extractInvoiceData(
        s3Key,
        customPrompt,
        "Payment Advice"
      );

      logger.info(
        `Data extracted successfully for Payment Advice ${paymentAdviceId}`
      );

      await PaymentAdvice.findByIdAndUpdate(paymentAdviceId, {
        payment_advice_data: extractedData,
        status: "pending-approval",
      });

      logger.info(
        `Payment Advice ${paymentAdviceId} updated with extracted data`
      );
    } catch (error) {
      logger.error(
        `Payment Advice extraction failed for ${paymentAdviceId}:`,
        error
      );
      await PaymentAdvice.findByIdAndUpdate(paymentAdviceId, {
        status: "pending-approval",
        payment_advice_data: {
          error: "Extraction failed",
          errorDetails: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async getPaymentAdvicesByOrganization(
    organizationId: string
  ): Promise<any[]> {
    return PaymentAdvice.find({
      organization: new Types.ObjectId(organizationId),
      active: true,
    })
      .lean()
      .sort({ createdAt: -1 });
  }

  async getPaymentAdvicesByOrganizationPaginated(
    organizationId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ documents: any[]; total: number }> {
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      PaymentAdvice.find({
        organization: new Types.ObjectId(organizationId),
        active: true,
      })
        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PaymentAdvice.countDocuments({
        organization: new Types.ObjectId(organizationId),
        active: true,
      }),
    ]);

    return { documents, total };
  }

  async getPaymentAdviceById(paymentAdviceId: string): Promise<any> {
    const paymentAdvice = await PaymentAdvice.findOne({
      _id: paymentAdviceId,
      active: true,
    }).lean();

    if (!paymentAdvice) {
      throw new NotFoundError("Payment Advice not found");
    }

    return paymentAdvice;
  }

  async deletePaymentAdvice(paymentAdviceId: string): Promise<void> {
    const paymentAdvice = await PaymentAdvice.findByIdAndUpdate(
      paymentAdviceId,
      { active: false },
      { new: true }
    ).lean();

    if (!paymentAdvice) {
      throw new NotFoundError("Payment Advice not found");
    }

    logger.info(`Payment Advice soft deleted: ${paymentAdviceId}`);
  }

  async updatePaymentAdviceStatus(
    paymentAdviceId: string,
    status: string,
    updateData?: any
  ): Promise<any> {
    const updateFields = updateData || { status };

    const paymentAdvice = await PaymentAdvice.findByIdAndUpdate(
      paymentAdviceId,
      updateFields,
      { new: true }
    ).lean();

    if (!paymentAdvice) {
      throw new NotFoundError("Payment Advice not found");
    }

    logger.info(
      `Payment Advice status updated to ${status} for Payment Advice: ${paymentAdviceId}`
    );
    return paymentAdvice;
  }

  async updatePaymentAdviceData(
    paymentAdviceId: string,
    paymentAdviceData: any
  ): Promise<any> {
    logger.info(`Updating Payment Advice data for: ${paymentAdviceId}`);

    const paymentAdvice = await PaymentAdvice.findByIdAndUpdate(
      paymentAdviceId,
      { payment_advice_data: paymentAdviceData },
      { new: true }
    ).lean();

    if (!paymentAdvice) {
      throw new NotFoundError("Payment Advice not found");
    }

    logger.info(`Payment Advice data updated successfully: ${paymentAdviceId}`);
    return paymentAdvice;
  }

  async getPaymentAdviceWithOrganization(
    paymentAdviceId: string
  ): Promise<any> {
    const paymentAdvice = await PaymentAdvice.findOne({
      _id: paymentAdviceId,
      active: true,
    })
      .populate("organization", "name code paymentadvice_prompt")
      .lean();

    if (!paymentAdvice) {
      throw new NotFoundError("Payment Advice not found");
    }

    return paymentAdvice;
  }

  async reScanPaymentAdvice(paymentAdviceId: string): Promise<void> {
    const paymentAdvice = await PaymentAdvice.findById(
      paymentAdviceId
    ).populate("organization");

    if (!paymentAdvice) {
      throw new NotFoundError("Payment Advice not found");
    }

    logger.info(`Re-scanning Payment Advice: ${paymentAdviceId}`);

    await PaymentAdvice.findByIdAndUpdate(paymentAdviceId, {
      status: "ocr-running",
      payment_advice_data: null,
    });

    this.processPaymentAdviceExtraction(
      paymentAdviceId,
      paymentAdvice.s3_key,
      paymentAdvice.organization._id.toString()
    ).catch((err) => {
      logger.error(`Error re-scanning Payment Advice ${paymentAdviceId}:`, err);
    });
  }
}

export default new PaymentAdviceService();
