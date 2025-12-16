import axios from "axios";
import { environment } from "../config/environment";
import logger from "../config/logger";
import S3Service from "./s3.service";
import ErrorLogService from "./errorLog.service";

class GeminiService {
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;

  constructor() {
    this.apiKey = environment.geminiApiKey;
    this.baseUrl = "https://generativelanguage.googleapis.com/v1";
    this.modelName = "gemini-2.0-flash";

    if (!this.apiKey) {
      logger.error("GEMINI_API_KEY is not set in environment variables");
    } else {
      logger.info(
        `GEMINI_API_KEY is configured, will try models starting with: ${this.modelName}`
      );
    }
  }

  private async parseDateString(dateString: string): Promise<Date | null> {
    if (!dateString || typeof dateString !== "string") return null;

    try {
      const cleanedDate = dateString.trim();

      if (cleanedDate.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
        const [day, month, year] = cleanedDate.split("-");
        return new Date(
          Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day))
        );
      }

      if (cleanedDate.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const [day, month, year] = cleanedDate.split("/");
        return new Date(
          Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day))
        );
      }

      if (cleanedDate.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
        const [day, month, year] = cleanedDate.split(".");
        return new Date(
          Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day))
        );
      }

      if (cleanedDate.match(/^\d{1,2}-[A-Za-z]{3}-\d{2}$/)) {
        const [day, monthStr, year] = cleanedDate.split("-");
        const monthMap: { [key: string]: number } = {
          jan: 0,
          feb: 1,
          mar: 2,
          apr: 3,
          may: 4,
          jun: 5,
          jul: 6,
          aug: 7,
          sep: 8,
          oct: 9,
          nov: 10,
          dec: 11,
        };
        const month = monthMap[monthStr.toLowerCase()];
        if (month !== undefined) {
          const fullYear =
            parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);
          return new Date(fullYear, month, parseInt(day));
        }
      }

      if (cleanedDate.match(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/)) {
        const [day, monthStr, year] = cleanedDate.split("-");
        const monthMap: { [key: string]: number } = {
          jan: 0,
          feb: 1,
          mar: 2,
          apr: 3,
          may: 4,
          jun: 5,
          jul: 6,
          aug: 7,
          sep: 8,
          oct: 9,
          nov: 10,
          dec: 11,
        };
        const month = monthMap[monthStr.toLowerCase()];
        if (month !== undefined) {
          return new Date(Date.UTC(parseInt(year), month, parseInt(day)));
        }
      }

      if (cleanedDate.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
        const [year, month, day] = cleanedDate.split("-");
        return new Date(
          Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day))
        );
      }

      const parsedDate = new Date(cleanedDate);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to parse date: ${dateString}`, error);
      return null;
    }
  }

  private async processExtractedData(
    data: any,
    documentType: string
  ): Promise<any> {
    if (!data || typeof data !== "object") return data;

    const processedData = { ...data };

    const dateFields = {
      Invoice: ["invoiceDate"],
      "Purchase Order": ["poDate", "deliveryDate"],
      GRN: ["grnDate"],
      "Payment Advice": [],
    };

    const fieldsToConvert = dateFields[documentType] || [];

    for (const field of fieldsToConvert) {
      if (processedData[field]) {
        const parsedDate = await this.parseDateString(processedData[field]);
        if (parsedDate) {
          processedData[field] = parsedDate;
        }
      }
    }

    return processedData;
  }

  private async limitPdfPages(
    pdfBuffer: Buffer,
    maxPages: number = 5
  ): Promise<Buffer> {
    try {
      try {
        const { PDFDocument } = await import("pdf-lib");

        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pageCount = pdfDoc.getPageCount();

        if (pageCount <= maxPages) {
          logger.info(
            `PDF has ${pageCount} pages, which is within the ${maxPages} page limit`
          );
          return pdfBuffer;
        }

        const newPdfDoc = await PDFDocument.create();
        const pages = await newPdfDoc.copyPages(
          pdfDoc,
          Array.from({ length: maxPages }, (_, i) => i)
        );

        pages.forEach((page) => newPdfDoc.addPage(page));

        const limitedPdfBytes = await newPdfDoc.save();
        logger.info(`PDF limited from ${pageCount} pages to ${maxPages} pages`);

        return Buffer.from(limitedPdfBytes);
      } catch (importError) {
        logger.warn(
          `pdf-lib not available for PDF page limiting: ${importError.message}. Install with: npm install pdf-lib`
        );
        logger.info(
          `Proceeding with original PDF - consider installing pdf-lib for page limiting functionality`
        );
        return pdfBuffer;
      }
    } catch (error) {
      logger.error("Error limiting PDF pages:", error);
      return pdfBuffer;
    }
  }

  async extractInvoiceData(
    s3Key: string,
    customPrompt?: string,
    documentType: string = "Invoice"
  ): Promise<any> {
    let base64Content: string;
    let mimeType: string = "image/jpeg";

    try {
      logger.info(`Starting Gemini extraction for ${documentType}: ${s3Key}`);

      if (!this.apiKey) {
        throw new Error(
          "GEMINI_API_KEY is not set. Please configure it in your environment variables."
        );
      }

      logger.info("Fetching file from S3 using AWS SDK...");

      try {
        let fileBuffer = await S3Service.getFileBuffer(s3Key);

        const keyLower = s3Key.toLowerCase();
        if (keyLower.includes(".pdf") || keyLower.endsWith(".pdf")) {
          mimeType = "application/pdf";

          if (
            documentType === "Purchase Order" &&
            customPrompt?.includes("UBOARD")
          ) {
            fileBuffer = await this.limitPdfPages(fileBuffer, 5);
            logger.info(
              "Applied 5-page limit for UBOARD Purchase Order PDF in AI processing"
            );
          }
        } else if (keyLower.includes(".png") || keyLower.endsWith(".png")) {
          mimeType = "image/png";
        } else if (
          keyLower.includes(".jpg") ||
          keyLower.endsWith(".jpg") ||
          keyLower.includes(".jpeg") ||
          keyLower.endsWith(".jpeg")
        ) {
          mimeType = "image/jpeg";
        } else if (keyLower.includes(".webp") || keyLower.endsWith(".webp")) {
          mimeType = "image/webp";
        } else if (keyLower.includes(".gif") || keyLower.endsWith(".gif")) {
          mimeType = "image/gif";
        } else if (keyLower.includes(".bmp") || keyLower.endsWith(".bmp")) {
          mimeType = "image/bmp";
        }

        base64Content = fileBuffer.toString("base64");

        logger.info(
          `File successfully downloaded and converted to base64, mime type: ${mimeType}, size: ${fileBuffer.length} bytes`
        );
      } catch (error) {
        logger.error(`Failed to download file from S3: ${error.message}`);
        await ErrorLogService.logServiceError(
          "GeminiService",
          "extractInvoiceData_S3Download_SystemError",
          error,
          { documentType, s3Key, mimeType, systemError: true }
        );
        throw new Error(
          `Cannot access the file at ${s3Key}. S3 access error: ${error.message}`
        );
      }

      const extractionPrompt =
        customPrompt || this.getMinimalFallbackPrompt(documentType);

      logger.info(
        `Using ${
          customPrompt ? "ORGANIZATION-SPECIFIC" : "FALLBACK"
        } prompt for ${documentType}`
      );

      if (customPrompt) {
        logger.info(
          `Organization prompt being used (first 150 chars): ${customPrompt.substring(
            0,
            150
          )}...`
        );
      } else {
        logger.warn(
          `No organization-specific prompt found for ${documentType}, using fallback`
        );
      }

      const modelNames = ["gemini-2.0-flash"];

      let lastError: any;
      logger.info(`Will try models in this order: ${modelNames.join(", ")}`);

      for (const modelName of modelNames) {
        try {
          const apiEndpoint = `${this.baseUrl}/models/${modelName}:generateContent`;
          logger.info(` Attempting extraction with model: ${modelName}`);

          const requestBody = {
            contents: [
              {
                parts: [
                  {
                    text: extractionPrompt,
                  },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Content,
                    },
                  },
                ],
              },
            ],
            generation_config: {
              temperature: 0,
              max_output_tokens: 4096,
            },
          };

          const response = await axios.post(apiEndpoint, requestBody, {
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            timeout: 120000,
          });

          logger.info(
            ` SUCCESS: ${modelName} API response received successfully`
          );
          const extractedData = await this.parseGeminiResponse(response.data);

          const processedData = await this.processExtractedData(
            extractedData,
            documentType
          );

          this.modelName = modelName;
          logger.info(` FINAL MODEL USED: ${modelName}`);

          return processedData;
        } catch (error) {
          lastError = error;

          if (axios.isAxiosError(error)) {
            const errorData = {
              documentType,
              s3Key,
              modelName,
              status: error.response?.status,
              statusText: error.response?.statusText,
              responseData: error.response?.data,
              requestConfig: {
                url: error.config?.url,
                method: error.config?.method,
                timeout: error.config?.timeout,
              },
              systemError: true,
            };

            if (error.response?.status === 404) {
              logger.warn(
                ` Model ${modelName} not found (404), trying next model...`
              );
              continue;
            } else if (error.response?.status === 400) {
              logger.warn(
                ` Model ${modelName} returned 400 error: ${error.response?.data?.error?.message}, trying next model...`
              );
              continue;
            } else if (error.response?.status === 503) {
              logger.error(
                ` Model ${modelName} failed with status 503: ${error.response?.data?.error?.message}`
              );
              await ErrorLogService.logServiceError(
                "GeminiService",
                "extractInvoiceData_ServiceUnavailable_SystemError",
                error,
                errorData
              );
              throw error;
            } else if (error.response?.status === 429) {
              logger.error(
                ` Model ${modelName} failed with status 429: Rate limit exceeded`
              );
              await ErrorLogService.logServiceError(
                "GeminiService",
                "extractInvoiceData_RateLimit_SystemError",
                error,
                errorData
              );
              throw error;
            } else {
              logger.error(
                ` Model ${modelName} failed with status ${error.response?.status}: ${error.response?.data?.error?.message}`
              );
              await ErrorLogService.logServiceError(
                "GeminiService",
                "extractInvoiceData_HTTPError_SystemError",
                error,
                errorData
              );
              throw error;
            }
          } else {
            logger.error(
              ` Model ${modelName} failed with non-HTTP error: ${error.message}`
            );
            await ErrorLogService.logServiceError(
              "GeminiService",
              "extractInvoiceData_NonHTTPError_SystemError",
              error,
              {
                documentType,
                s3Key,
                modelName,
                errorType: "NonHTTP",
                systemError: true,
              }
            );
            throw error;
          }
        }
      }

      logger.error(" ALL MODELS FAILED - No working Gemini model found");
      await ErrorLogService.logServiceError(
        "GeminiService",
        "extractInvoiceData_AllModelsFailed_SystemError",
        lastError,
        {
          documentType,
          s3Key,
          attemptedModels: modelNames,
          systemError: true,
        }
      );
      throw lastError;
    } catch (error) {
      logger.error("Error calling Gemini API:", error);

      if (axios.isAxiosError(error)) {
        logger.error(`Status code: ${error.response?.status}`);
        logger.error(
          `Error response data: ${JSON.stringify(error.response?.data || {})}`
        );
      }

      throw new Error(
        `Failed to extract ${documentType} data: ${error.message}`
      );
    }
  }

  private getMinimalFallbackPrompt(documentType: string): string {
    const basePrompt = `Analyze this ${documentType} document and extract all information as JSON. Return only valid JSON with no markdown or explanations.`;

    logger.warn(
      `Using minimal fallback prompt for ${documentType} - organization prompt should be configured`
    );

    return basePrompt;
  }

  private async parseGeminiResponse(response: any): Promise<any> {
    try {
      logger.info("Parsing Gemini response...");

      if (response.candidates && response.candidates.length > 0) {
        const content = response.candidates[0].content;

        if (content && content.parts && content.parts.length > 0) {
          const text = content.parts[0].text;
          logger.info(`Raw response text length: ${text.length} characters`);

          try {
            const parsedData = JSON.parse(text);
            logger.info("Successfully parsed JSON directly from response");
            return parsedData;
          } catch (parseError) {
            logger.warn("Direct JSON parse failed, trying alternatives");
          }

          const jsonMatch =
            text.match(/```json\n([\s\S]*?)\n```/) ||
            text.match(/```\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            try {
              const parsedData = JSON.parse(jsonMatch[1]);
              logger.info("Successfully parsed JSON from markdown code block");
              return parsedData;
            } catch (parseError) {
              logger.warn("Failed to parse JSON from code block");
            }
          }

          const jsonObjectMatch = text.match(/{[\s\S]*}/);
          if (jsonObjectMatch) {
            try {
              const parsedData = JSON.parse(jsonObjectMatch[0]);
              logger.info("Successfully parsed JSON object from text");
              return parsedData;
            } catch (parseError) {
              logger.warn("Failed to parse JSON object from regex match");
            }
          }

          logger.error(
            `Failed to parse JSON. Response text: ${text.substring(0, 500)}...`
          );
          return {
            error: "Failed to parse structured data from response",
            extractedText: text,
            message:
              "The AI read the document but returned data in an unexpected format. Please try again.",
          };
        }
      }

      if (response.error) {
        logger.error(`Gemini API error: ${JSON.stringify(response.error)}`);
        throw new Error(
          `Gemini API error: ${response.error.message || "Unknown error"}`
        );
      }

      throw new Error("Unexpected response structure from Gemini API");
    } catch (error) {
      logger.error("Error parsing Gemini response:", error);
      throw new Error(`Failed to parse Gemini response: ${error.message}`);
    }
  }
}

export default new GeminiService();
