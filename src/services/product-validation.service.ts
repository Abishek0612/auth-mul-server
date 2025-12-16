import UboardProductMaster from "../models/uboard-product-master.model";
import UboardSiteMaster from "../models/uboard-site-master.model";
import logger from "../config/logger";

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

interface POLineItem {
  articleNo: string;
  hsn: string;
  eanNo?: string;
  baseCost: number;
  igstPercent?: string;
  cgstPercent?: string;
  sgstPercent?: string;
  [key: string]: any;
}

class ProductValidationService {
  async validatePOItems(items: POLineItem[]): Promise<ValidationResult[]> {
    const validationResults: ValidationResult[] = [];

    for (const item of items) {
      const result = await this.validateSingleItem(item);
      validationResults.push(result);
    }

    return validationResults;
  }

  async validateSingleItem(item: POLineItem): Promise<ValidationResult> {
    const result: ValidationResult = {
      articleCode: item.articleNo || "",
      isValid: true,
      mismatches: [],
      errors: [],
    };

    try {
      if (!item.articleNo) {
        result.isValid = false;
        result.errors.push("Article Code is missing");
        return result;
      }

      const productMaster = await UboardProductMaster.findOne({
        articleCode: item.articleNo,
        active: true,
      }).lean();

      if (!productMaster) {
        result.isValid = false;
        result.errors.push(`Product not found in master data`);
        return result;
      }

      if (item.eanNo && item.eanNo !== productMaster.eanCode) {
        result.mismatches.push({
          field: "EAN Code",
          expected: productMaster.eanCode,
          actual: item.eanNo,
        });
        result.isValid = false;
      }

      const itemBaseCost = parseFloat(String(item.baseCost));
      const masterBaseCost = parseFloat(String(productMaster.baseCost));

      if (
        !isNaN(itemBaseCost) &&
        Math.abs(itemBaseCost - masterBaseCost) > 0.01
      ) {
        result.mismatches.push({
          field: "Base Cost",
          expected: masterBaseCost,
          actual: itemBaseCost,
        });
        result.isValid = false;
      }

      const poGstPercent = this.extractGSTPercent(item);
      if (poGstPercent !== null) {
        const masterGstPercent = productMaster.gstPercentage;
        if (Math.abs(poGstPercent - masterGstPercent) > 0.01) {
          result.mismatches.push({
            field: "GST Percentage",
            expected: masterGstPercent,
            actual: poGstPercent,
          });
          result.isValid = false;
        }
      }

      logger.info(
        `Validation completed for Article Code: ${item.articleNo}, Valid: ${result.isValid}, Mismatches: ${result.mismatches.length}`
      );
    } catch (error) {
      logger.error(`Error validating item ${item.articleNo}:`, error);
      result.isValid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }

    return result;
  }

  async validateSiteCode(siteCode: string): Promise<SiteValidationResult> {
    try {
      if (!siteCode || typeof siteCode !== "string") {
        return {
          isValid: false,
          error: "Site Code is missing or invalid",
          extractedSite: siteCode || "N/A",
        };
      }

      const trimmedSiteCode = siteCode.trim();

      const siteMaster = await UboardSiteMaster.findOne({
        siteCode: trimmedSiteCode,
        active: true,
      }).lean();

      if (!siteMaster) {
        return {
          isValid: false,
          error: `The extracted Site Code "${trimmedSiteCode}" doesn't exist in the master.`,
          extractedSite: trimmedSiteCode,
        };
      }

      logger.info(`Site Code validation passed for: ${trimmedSiteCode}`);
      return {
        isValid: true,
        extractedSite: trimmedSiteCode,
      };
    } catch (error) {
      logger.error(`Error validating site code ${siteCode}:`, error);
      return {
        isValid: false,
        error: `Site validation error: ${error.message}`,
        extractedSite: siteCode,
      };
    }
  }

  private extractGSTPercent(item: POLineItem): number | null {
    try {
      if (item.igstPercent) {
        const igst = parseFloat(String(item.igstPercent).replace("%", ""));
        if (!isNaN(igst) && igst > 0) {
          return igst;
        }
      }

      const cgst = item.cgstPercent
        ? parseFloat(String(item.cgstPercent).replace("%", ""))
        : 0;
      const sgst = item.sgstPercent
        ? parseFloat(String(item.sgstPercent).replace("%", ""))
        : 0;

      if (!isNaN(cgst) && !isNaN(sgst) && (cgst > 0 || sgst > 0)) {
        return cgst + sgst;
      }

      return null;
    } catch (error) {
      logger.warn(`Error extracting GST percent from item:`, error);
      return null;
    }
  }

  async getProductByArticleCode(articleCode: string) {
    return UboardProductMaster.findOne({
      articleCode,
      active: true,
    }).lean();
  }

  async getSiteBySiteCode(siteCode: string) {
    return UboardSiteMaster.findOne({
      siteCode: siteCode.trim(),
      active: true,
    }).lean();
  }
}

export default new ProductValidationService();
