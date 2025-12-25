import AWS from "aws-sdk";
import { environment } from "../config/environment";
import logger from "../config/logger";
import ErrorLogService from "./errorLog.service";

class S3Service {
  private s3: AWS.S3;

  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: environment.awsAccessKey,
      secretAccessKey: environment.awsSecretKey,
      region: environment.awsRegion,
    });
  }

  generatePresignedUploadUrl(
    fileName: string,
    contentType: string,
    expiresIn: number = 300
  ): { uploadUrl: string; key: string; expiresAt: Date } {
    const key = `${Date.now()}-${fileName}`;

    const params = {
      Bucket: environment.awsS3Bucket,
      Key: key,
      ContentType: contentType,
      Expires: expiresIn,
    };

    try {
      const uploadUrl = this.s3.getSignedUrl("putObject", params);
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      console.log("=== PRESIGNED UPLOAD URL GENERATED ===");
      console.log("File Name:", fileName);
      console.log("S3 Key:", key);
      console.log("Content Type:", contentType);
      console.log("Upload URL:", uploadUrl);
      console.log("Expires In:", expiresIn, "seconds (5 minutes)");
      console.log("Expires At:", expiresAt.toISOString());
      console.log("======================================");

      logger.info(
        `Generated presigned upload URL for ${fileName}, expires in ${expiresIn}s at ${expiresAt.toISOString()}`
      );

      return { uploadUrl, key, expiresAt };
    } catch (error: any) {
      logger.error(`Error generating presigned upload URL: ${error.message}`);
      throw new Error(
        `Failed to generate presigned upload URL: ${error.message}`
      );
    }
  }

  async uploadFile(
    file: Buffer,
    fileName: string,
    contentType: string
  ): Promise<string> {
    const key = `${Date.now()}-${fileName}`;
    const params = {
      Bucket: environment.awsS3Bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
    };

    try {
      logger.info(`Uploading file to S3: ${fileName}`);
      console.log("=== S3 DIRECT UPLOAD ===");
      console.log("File Name:", fileName);
      console.log("S3 Key:", key);
      console.log("Content Type:", contentType);
      console.log("File Size:", file.length, "bytes");

      const uploadResult = await this.s3.upload(params).promise();

      console.log("Upload Location:", uploadResult.Location);
      console.log("Returning S3 Key:", key);
      console.log("========================");

      logger.info(`File uploaded successfully. S3 Key: ${key}`);

      return key;
    } catch (error: any) {
      logger.error(`Error uploading file to S3: ${error.message}`);
      await ErrorLogService.logServiceError(
        "S3Service",
        "uploadFile_SystemError",
        error,
        {
          fileName,
          contentType,
          bucket: environment.awsS3Bucket,
          fileSize: file.length,
          errorCode: error.code,
          statusCode: error.statusCode,
          systemError: true,
        }
      );
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  async deleteFile(s3Key: string): Promise<void> {
    try {
      const params = {
        Bucket: environment.awsS3Bucket,
        Key: s3Key,
      };

      logger.info(`Deleting file from S3: ${s3Key}`);
      await this.s3.deleteObject(params).promise();
      logger.info(`File deleted successfully: ${s3Key}`);
    } catch (error: any) {
      logger.error(`Error deleting file from S3: ${error.message}`);
      await ErrorLogService.logServiceError(
        "S3Service",
        "deleteFile_SystemError",
        error,
        {
          s3Key,
          bucket: environment.awsS3Bucket,
          errorCode: error.code,
          statusCode: error.statusCode,
          systemError: true,
        }
      );
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  async getFileBuffer(s3Key: string): Promise<Buffer> {
    try {
      logger.info(
        `Getting file from S3 bucket: ${environment.awsS3Bucket}, key: ${s3Key}`
      );

      const params = {
        Bucket: environment.awsS3Bucket,
        Key: s3Key,
      };

      const data = await this.s3.getObject(params).promise();
      logger.info(`File retrieved successfully from S3: ${s3Key}`);

      if (!data.Body || !(data.Body instanceof Buffer)) {
        throw new Error("S3 object body is missing or not a Buffer.");
      }

      return data.Body as Buffer;
    } catch (error: any) {
      logger.error(`Error getting file from S3: ${error.message}`);
      await ErrorLogService.logServiceError(
        "S3Service",
        "getFileBuffer_SystemError",
        error,
        {
          s3Key,
          bucket: environment.awsS3Bucket,
          errorCode: error.code,
          statusCode: error.statusCode,
          systemError: true,
        }
      );
      throw new Error(`Failed to access S3 file: ${error.message}`);
    }
  }

  getSignedUrl(s3Key: string, expiresIn: number = 300): string {
    try {
      const params = {
        Bucket: environment.awsS3Bucket,
        Key: s3Key,
        Expires: expiresIn,
      };

      const signedUrl = this.s3.getSignedUrl("getObject", params);
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      console.log("=== SIGNED DOWNLOAD URL ===");
      console.log("S3 Key:", s3Key);
      console.log("Signed URL:", signedUrl);
      console.log("Expires In:", expiresIn, "seconds (5 minutes)");
      console.log("Expires At:", expiresAt.toISOString());
      console.log("===========================");

      logger.info(
        `Generated signed URL for key: ${s3Key} with expiry ${expiresIn}s`
      );

      return signedUrl;
    } catch (error: any) {
      logger.error(
        `Error generating signed URL for ${s3Key}: ${error.message}`
      );
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  getS3UrlFromKey(key: string): string {
    return `https://${environment.awsS3Bucket}.s3.${environment.awsRegion}.amazonaws.com/${key}`;
  }
}

export default new S3Service();
