import InvoiceService from "./invoice.service";
import PurchaseOrderService from "./purchaseorder.service";
import GRNService from "./grn.service";
import PaymentAdviceService from "./paymentadvice.service";
import Organization from "../models/organization.model";
import Invoice from "../models/invoice.model";
import PurchaseOrder from "../models/purchaseorder.model";
import GRN from "../models/grn.model";
import PaymentAdvice from "../models/paymentadvice.model";
import logger from "../config/logger";
import * as XLSX from "xlsx";
import S3Service from "./s3.service";

class DocumentService {
  async uploadDocument(
    file: Buffer,
    fileName: string,
    fileType: string,
    userId: string,
    organizationId: string,
    documentType: string
  ): Promise<any> {
    if (documentType.toLowerCase() === "purchase order") {
      return PurchaseOrderService.uploadPurchaseOrder(
        file,
        fileName,
        fileType,
        userId,
        organizationId
      );
    } else if (documentType.toLowerCase() === "grn") {
      return GRNService.uploadGRN(
        file,
        fileName,
        fileType,
        userId,
        organizationId
      );
    } else if (documentType.toLowerCase() === "payment advice") {
      return PaymentAdviceService.uploadPaymentAdvice(
        file,
        fileName,
        fileType,
        userId,
        organizationId
      );
    } else {
      return InvoiceService.uploadInvoice(
        file,
        fileName,
        fileType,
        userId,
        organizationId,
        documentType
      );
    }
  }

  async getAllDocumentsByOrganization(
    organizationId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ documents: any[]; total: number; page: number; pages: number }> {
    try {
      const skip = (page - 1) * limit;

      const [invoices, purchaseOrders, grns, paymentAdvices] =
        await Promise.all([
          InvoiceService.getInvoicesByOrganizationPaginated(
            organizationId,
            page,
            limit
          ),
          PurchaseOrderService.getPurchaseOrdersByOrganizationPaginated(
            organizationId,
            page,
            limit
          ),
          GRNService.getGRNsByOrganizationPaginated(
            organizationId,
            page,
            limit
          ),
          PaymentAdviceService.getPaymentAdvicesByOrganizationPaginated(
            organizationId,
            page,
            limit
          ),
        ]);

      const transformedInvoices = invoices.documents.map((invoice) => ({
        ...invoice,
        document_type: invoice.document_type || "Invoice",
        s3_url: S3Service.getSignedUrl(invoice.s3_key),
      }));

      const transformedPurchaseOrders = purchaseOrders.documents.map((po) => ({
        ...po,
        document_type: "Purchase Order",
        s3_url: S3Service.getSignedUrl(po.s3_key),
      }));

      const transformedGRNs = grns.documents.map((grn) => ({
        ...grn,
        document_type: "GRN",
        s3_url: S3Service.getSignedUrl(grn.s3_key),
      }));

      const transformedPaymentAdvices = paymentAdvices.documents.map((pa) => ({
        ...pa,
        document_type: "Payment Advice",
        s3_url: S3Service.getSignedUrl(pa.s3_key),
      }));

      const allDocuments = [
        ...transformedInvoices,
        ...transformedPurchaseOrders,
        ...transformedGRNs,
        ...transformedPaymentAdvices,
      ];

      const sortedDocuments = allDocuments.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const paginatedDocuments = sortedDocuments.slice(0, limit);

      const total =
        invoices.total +
        purchaseOrders.total +
        grns.total +
        paymentAdvices.total;
      const pages = Math.ceil(total / limit);

      return {
        documents: paginatedDocuments,
        total,
        page,
        pages,
      };
    } catch (error) {
      logger.error("Error fetching documents:", error);
      throw error;
    }
  }

  async getDocumentById(
    documentId: string,
    documentType: string
  ): Promise<any> {
    let document;

    if (documentType.toLowerCase() === "purchase order") {
      const po = await PurchaseOrderService.getPurchaseOrderWithOrganization(
        documentId
      );
      document = {
        ...po,
        document_type: "Purchase Order",
        s3_url: S3Service.getSignedUrl(po.s3_key),
      };
    } else if (documentType.toLowerCase() === "grn") {
      const grn = await GRNService.getGRNWithOrganization(documentId);
      document = {
        ...grn,
        document_type: "GRN",
        s3_url: S3Service.getSignedUrl(grn.s3_key),
      };
    } else if (documentType.toLowerCase() === "payment advice") {
      const paymentAdvice =
        await PaymentAdviceService.getPaymentAdviceWithOrganization(documentId);
      document = {
        ...paymentAdvice,
        document_type: "Payment Advice",
        s3_url: S3Service.getSignedUrl(paymentAdvice.s3_key),
      };
    } else {
      const invoice = await InvoiceService.getInvoiceWithOrganization(
        documentId
      );
      document = {
        ...invoice,
        document_type: invoice.document_type || "Invoice",
        s3_url: S3Service.getSignedUrl(invoice.s3_key),
      };
    }

    return document;
  }

  async deleteDocument(
    documentId: string,
    documentType: string
  ): Promise<void> {
    if (documentType.toLowerCase() === "purchase order") {
      return PurchaseOrderService.deletePurchaseOrder(documentId);
    } else if (documentType.toLowerCase() === "grn") {
      return GRNService.deleteGRN(documentId);
    } else if (documentType.toLowerCase() === "payment advice") {
      return PaymentAdviceService.deletePaymentAdvice(documentId);
    } else {
      return InvoiceService.deleteInvoice(documentId);
    }
  }

  async updateDocumentStatus(
    documentId: string,
    status: string,
    documentType: string
  ): Promise<any> {
    const updateData: any = { status };
    if (status === "approved") {
      updateData.approval_date = new Date();
    }

    if (documentType.toLowerCase() === "purchase order") {
      return PurchaseOrderService.updatePurchaseOrderStatus(
        documentId,
        status,
        updateData
      );
    } else if (documentType.toLowerCase() === "grn") {
      return GRNService.updateGRNStatus(documentId, status, updateData);
    } else if (documentType.toLowerCase() === "payment advice") {
      return PaymentAdviceService.updatePaymentAdviceStatus(
        documentId,
        status,
        updateData
      );
    } else {
      return InvoiceService.updateInvoiceStatus(documentId, status, updateData);
    }
  }

  async updateDocumentData(
    documentId: string,
    documentType: string,
    data: any
  ): Promise<any> {
    const processedData = this.processDateFields(data, documentType);

    if (documentType.toLowerCase() === "purchase order") {
      return PurchaseOrderService.updatePurchaseOrderData(
        documentId,
        processedData
      );
    } else if (documentType.toLowerCase() === "grn") {
      return GRNService.updateGRNData(documentId, processedData);
    } else if (documentType.toLowerCase() === "payment advice") {
      return PaymentAdviceService.updatePaymentAdviceData(
        documentId,
        processedData
      );
    } else {
      return InvoiceService.updateInvoiceData(documentId, processedData);
    }
  }

  async reScanDocument(
    documentId: string,
    documentType: string
  ): Promise<void> {
    if (documentType.toLowerCase() === "purchase order") {
      return PurchaseOrderService.reScanPurchaseOrder(documentId);
    } else if (documentType.toLowerCase() === "grn") {
      return GRNService.reScanGRN(documentId);
    } else if (documentType.toLowerCase() === "payment advice") {
      return PaymentAdviceService.reScanPaymentAdvice(documentId);
    } else {
      return InvoiceService.reScanInvoice(documentId);
    }
  }

  async checkDocumentDuplicates(
    documentId: string,
    documentType: string,
    organizationId: string
  ): Promise<any> {
    try {
      logger.info(
        `Checking duplicates for document ${documentId} of type ${documentType}`
      );

      const currentDocument = await this.getDocumentById(
        documentId,
        documentType
      );

      if (!currentDocument) {
        return { hasDuplicates: false, duplicates: [] };
      }

      const extractedData = this.getExtractedDataFromDocument(
        currentDocument,
        documentType
      );
      const documentNumber = this.getDocumentNumberFromData(
        extractedData,
        documentType
      );

      if (!documentNumber || documentNumber === "N/A") {
        return { hasDuplicates: false, duplicates: [] };
      }

      const organization = await Organization.findById(organizationId);
      const orgCode = organization?.code || "KIWI";

      const allDocuments = await this.getAllDocumentsByOrganization(
        organizationId,
        1,
        10000
      );

      const duplicates = [];

      for (const doc of allDocuments.documents) {
        if (doc._id.toString() === documentId) continue;
        if (doc.document_type.toLowerCase() !== documentType.toLowerCase())
          continue;

        const docExtractedData = this.getExtractedDataFromDocument(
          doc,
          doc.document_type
        );
        const docNumber = this.getDocumentNumberFromData(
          docExtractedData,
          doc.document_type
        );

        if (docNumber && docNumber !== "N/A" && docNumber === documentNumber) {
          duplicates.push({
            id: doc._id.toString(),
            fileName: doc.file_name,
            documentNumber: docNumber,
            createdAt: doc.createdAt,
          });
        }
      }

      logger.info(
        `Found ${duplicates.length} duplicates for document ${documentId}`
      );

      return {
        hasDuplicates: duplicates.length > 0,
        duplicates: duplicates,
        currentDocumentNumber: documentNumber,
        organizationCode: orgCode,
        documentType: documentType,
      };
    } catch (error) {
      logger.error("Error checking document duplicates:", error);
      throw new Error(`Failed to check document duplicates: ${error.message}`);
    }
  }

  private getExtractedDataFromDocument(doc: any, documentType: string): any {
    switch (documentType.toLowerCase()) {
      case "invoice":
        return doc.invoice_data;
      case "purchase order":
        return doc.purchase_order_data;
      case "grn":
        return doc.grn_data;
      case "payment advice":
        return doc.payment_advice_data;
      default:
        return doc.invoice_data;
    }
  }

  private getDocumentNumberFromData(data: any, documentType: string): string {
    if (!data) return "N/A";

    switch (documentType.toLowerCase()) {
      case "invoice":
        return data.invoiceNumber || data.supplierName || "N/A";
      case "purchase order":
        return data.poNumber || "N/A";
      case "grn":
        return data.grnNumber || "N/A";
      case "payment advice":
        return data.documentNumber || "N/A";
      default:
        return data.invoiceNumber || data.supplierName || "N/A";
    }
  }

  private processDateFields(data: any, documentType: string): any {
    if (!data || typeof data !== "object") return data;

    const processedData = { ...data };

    const dateFields = {
      Invoice: ["invoiceDate"],
      "Purchase Order": ["poDate", "deliveryDate"],
      GRN: ["grnDate"],
      "Payment Advice": [],
    };

    const fieldsToProcess = dateFields[documentType] || [];

    fieldsToProcess.forEach((field) => {
      if (processedData[field] && typeof processedData[field] === "string") {
        const parsedDate = this.parseDate(processedData[field]);
        if (parsedDate) {
          processedData[field] = parsedDate;
        }
      }
    });

    return processedData;
  }

  private parseDate(dateString: string): Date | null {
    if (!dateString || typeof dateString !== "string") return null;

    try {
      const cleanedDate = dateString.trim();

      if (cleanedDate.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
        const [year, month, day] = cleanedDate.split("-");
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      if (cleanedDate.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
        const [day, month, year] = cleanedDate.split("-");
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      if (cleanedDate.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const [day, month, year] = cleanedDate.split("/");
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
          return new Date(parseInt(year), month, parseInt(day));
        }
      }

      if (cleanedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = cleanedDate.split("-");
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
  private getOrganizationFieldConfig(orgCode: string) {
    const configs = {
      UBOARD: {
        name: "UBOARD",
        Invoice: {
          fields: [
            { key: "invoiceNumber", label: "Invoice Number", type: "text" },
            { key: "buyerOrderNo", label: "Buyer Order No", type: "text" },
            { key: "invoiceDate", label: "Invoice Date", type: "date" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            { key: "invoiceQty", label: "Invoice Qty", type: "number" },
            { key: "grossAmount", label: "Gross Amount", type: "number" },
            { key: "gstAmount", label: "GST Amount", type: "number" },
            { key: "totalAmount", label: "Total Amount", type: "number" },
          ],
          itemFields: [
            { key: "itemName", label: "Item Name", type: "text" },
            { key: "articleNo", label: "Article No", type: "text" },
            { key: "hsn", label: "HSN", type: "text" },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "qtyUnit", label: "Unit", type: "text" },
            { key: "rate", label: "Rate", type: "number" },
            { key: "gstRate", label: "GST Rate", type: "text" },
            { key: "totalAmount", label: "Amount", type: "number" },
          ],
        },
        "Purchase Order": {
          fields: [
            { key: "poNumber", label: "PO Number", type: "text" },
            { key: "poDate", label: "PO Date", type: "date" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            { key: "deliveryDate", label: "Delivery Date", type: "date" },
            { key: "site", label: "Site", type: "text" },
            { key: "totalQty", label: "Total Qty", type: "number" },
            {
              key: "totalBasicValue",
              label: "Total Basic Value",
              type: "number",
            },
            { key: "totalIGST", label: "Total GST", type: "number" },
            {
              key: "totalOrderValue",
              label: "Total Order Value",
              type: "number",
            },
          ],
          itemFields: [
            { key: "articleNo", label: "Article No", type: "text" },
            { key: "hsn", label: "HSN", type: "text" },
            { key: "eanNo", label: "EAN No", type: "text" },
            { key: "description", label: "Description", type: "text" },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "baseCost", label: "Base Cost", type: "number" },
            { key: "igstPercent", label: "IGST%", type: "text" },
            { key: "igstValue", label: "IGST Value", type: "number" },
            { key: "cgstPercent", label: "CGST%", type: "text" },
            { key: "cgstValue", label: "CGST Value", type: "number" },
            { key: "sgstPercent", label: "SGST%", type: "text" },
            { key: "sgstValue", label: "SGST Value", type: "number" },
            {
              key: "totalBaseValue",
              label: "Total Base Value",
              type: "number",
            },
          ],
        },
        GRN: {
          fields: [
            { key: "grnNumber", label: "GRN Number", type: "text" },
            { key: "grnDate", label: "GRN Date", type: "date" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            {
              key: "vendorInvoiceNo",
              label: "Vendor Invoice No",
              type: "text",
            },
            { key: "grnQty", label: "GRN Qty", type: "number" },
            { key: "poNumber", label: "PO Number", type: "text" },
          ],
          itemFields: [
            { key: "articleNo", label: "Article No", type: "text" },
            { key: "description", label: "Description", type: "text" },
            { key: "ean", label: "EAN", type: "text" },
            { key: "challanQty", label: "Challan Qty", type: "number" },
            { key: "receivedQty", label: "Received Qty", type: "number" },
            { key: "acceptedQty", label: "Accepted Qty", type: "number" },
          ],
        },
        "Payment Advice": {
          fields: [
            { key: "documentNumber", label: "Document Number", type: "text" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            {
              key: "totalAmountSettled",
              label: "Total Amount Settled",
              type: "number",
            },
          ],
          itemFields: [
            { key: "invoiceNumber", label: "Invoice Number", type: "text" },
            { key: "invoiceAmount", label: "Invoice Amount", type: "number" },
            { key: "paymentAmount", label: "Payment Amount", type: "number" },
            { key: "tds", label: "TDS", type: "number" },
            { key: "gstTaxHold", label: "GST Tax Hold", type: "number" },
            { key: "gstTaxPaid", label: "GST Tax Paid", type: "number" },
            { key: "remarks", label: "Remarks", type: "text" },
          ],
        },
      },
      ELZA: {
        name: "ELZA",
        Invoice: {
          fields: [
            { key: "supplierName", label: "Supplier Name", type: "text" },
            { key: "invoiceNumber", label: "Invoice Number", type: "text" },
            { key: "invoiceDate", label: "Invoice Date", type: "date" },
            { key: "supplierGSTNo", label: "Supplier GST No", type: "text" },
            { key: "grossAmount", label: "Gross Amount", type: "number" },
            { key: "cgstAmount", label: "CGST Amount", type: "number" },
            { key: "sgstAmount", label: "SGST Amount", type: "number" },
            { key: "igstAmount", label: "IGST Amount", type: "number" },
            { key: "gstAmount", label: "Total GST Amount", type: "number" },
            { key: "totalAmount", label: "Total Amount", type: "number" },
          ],
          itemFields: [
            { key: "itemName", label: "Item Name", type: "text" },
            { key: "hsn", label: "HSN", type: "text" },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "qtyUnit", label: "Unit", type: "text" },
            { key: "rate", label: "Rate", type: "number" },
            { key: "gstRate", label: "GST Rate", type: "text" },
            { key: "totalAmount", label: "Amount", type: "number" },
          ],
        },
        "Purchase Order": {
          fields: [
            { key: "poNumber", label: "PO Number", type: "text" },
            { key: "poDate", label: "PO Date", type: "date" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            { key: "deliveryDate", label: "Delivery Date", type: "date" },
            { key: "site", label: "Site", type: "text" },
            {
              key: "totalBasicValue",
              label: "Total Basic Value",
              type: "number",
            },
            { key: "totalIGST", label: "Total IGST", type: "number" },
            {
              key: "totalOrderValue",
              label: "Total Order Value",
              type: "number",
            },
            { key: "totalQty", label: "Total Qty", type: "number" },
          ],
          itemFields: [
            { key: "articleNo", label: "Article No", type: "text" },
            { key: "hsn", label: "HSN", type: "text" },
            { key: "eanNo", label: "EAN No", type: "text" },
            { key: "description", label: "Description", type: "text" },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "baseCost", label: "Base Cost", type: "number" },
            { key: "igstPercent", label: "IGST%", type: "text" },
            { key: "igstValue", label: "IGST Value", type: "number" },
            {
              key: "totalBaseValue",
              label: "Total Base Value",
              type: "number",
            },
          ],
        },
        GRN: {
          fields: [
            { key: "grnNumber", label: "GRN Number", type: "text" },
            { key: "grnDate", label: "GRN Date", type: "date" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            {
              key: "vendorInvoiceNo",
              label: "Vendor Invoice No",
              type: "text",
            },
            { key: "grnQty", label: "GRN Qty", type: "number" },
            { key: "poNumber", label: "PO Number", type: "text" },
          ],
          itemFields: [
            { key: "articleNo", label: "Article No", type: "text" },
            { key: "description", label: "Description", type: "text" },
            { key: "challanQty", label: "Challan Qty", type: "number" },
            { key: "receivedQty", label: "Received Qty", type: "number" },
            { key: "acceptedQty", label: "Accepted Qty", type: "number" },
          ],
        },
        "Payment Advice": {
          fields: [
            { key: "documentNumber", label: "Document Number", type: "text" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            {
              key: "totalAmountSettled",
              label: "Total Amount Settled",
              type: "number",
            },
          ],
          itemFields: [
            { key: "invoiceNumber", label: "Invoice Number", type: "text" },
            { key: "invoiceAmount", label: "Invoice Amount", type: "number" },
            { key: "paymentAmount", label: "Payment Amount", type: "number" },
            { key: "tds", label: "TDS", type: "number" },
            { key: "gstTaxHold", label: "GST Tax Hold", type: "number" },
            { key: "gstTaxPaid", label: "GST Tax Paid", type: "number" },
          ],
        },
      },
      KIWI: {
        name: "KIWI",
        Invoice: {
          fields: [
            { key: "supplierName", label: "Supplier Name", type: "text" },
            { key: "invoiceNumber", label: "Invoice Number", type: "text" },
            { key: "invoiceDate", label: "Invoice Date", type: "date" },
            { key: "supplierGSTNo", label: "Supplier GST No", type: "text" },
            { key: "grossAmount", label: "Gross Amount", type: "number" },
            { key: "cgstAmount", label: "CGST Amount", type: "number" },
            { key: "sgstAmount", label: "SGST Amount", type: "number" },
            { key: "igstAmount", label: "IGST Amount", type: "number" },
            { key: "gstAmount", label: "Total GST Amount", type: "number" },
            { key: "totalAmount", label: "Total Amount", type: "number" },
          ],
          itemFields: [
            { key: "itemName", label: "Item Name", type: "text" },
            { key: "hsn", label: "HSN", type: "text" },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "qtyUnit", label: "Unit", type: "text" },
            { key: "rate", label: "Rate", type: "number" },
            { key: "gstRate", label: "GST Rate", type: "text" },
            { key: "totalAmount", label: "Amount", type: "number" },
          ],
        },
        "Purchase Order": {
          fields: [
            { key: "poNumber", label: "PO Number", type: "text" },
            { key: "poDate", label: "PO Date", type: "date" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            { key: "deliveryDate", label: "Delivery Date", type: "date" },
            { key: "site", label: "Site", type: "text" },
            {
              key: "totalBasicValue",
              label: "Total Basic Value",
              type: "number",
            },
            { key: "totalIGST", label: "Total IGST", type: "number" },
            {
              key: "totalOrderValue",
              label: "Total Order Value",
              type: "number",
            },
            { key: "totalQty", label: "Total Qty", type: "number" },
          ],
          itemFields: [
            { key: "articleNo", label: "Article No", type: "text" },
            { key: "hsn", label: "HSN", type: "text" },
            { key: "eanNo", label: "EAN No", type: "text" },
            { key: "description", label: "Description", type: "text" },
            { key: "quantity", label: "Quantity", type: "number" },
            { key: "baseCost", label: "Base Cost", type: "number" },
            { key: "igstPercent", label: "IGST%", type: "text" },
            { key: "igstValue", label: "IGST Value", type: "number" },
            {
              key: "totalBaseValue",
              label: "Total Base Value",
              type: "number",
            },
          ],
        },
        GRN: {
          fields: [
            { key: "grnNumber", label: "GRN Number", type: "text" },
            { key: "grnDate", label: "GRN Date", type: "date" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            {
              key: "vendorInvoiceNo",
              label: "Vendor Invoice No",
              type: "text",
            },
            { key: "grnQty", label: "GRN Qty", type: "number" },
            { key: "poNumber", label: "PO Number", type: "text" },
          ],
          itemFields: [
            { key: "articleNo", label: "Article No", type: "text" },
            { key: "description", label: "Description", type: "text" },
            { key: "challanQty", label: "Challan Qty", type: "number" },
            { key: "receivedQty", label: "Received Qty", type: "number" },
            { key: "acceptedQty", label: "Accepted Qty", type: "number" },
          ],
        },
        "Payment Advice": {
          fields: [
            { key: "documentNumber", label: "Document Number", type: "text" },
            { key: "buyerName", label: "Buyer Name", type: "text" },
            { key: "sellerName", label: "Seller Name", type: "text" },
            {
              key: "totalAmountSettled",
              label: "Total Amount Settled",
              type: "number",
            },
          ],
          itemFields: [
            { key: "invoiceNumber", label: "Invoice Number", type: "text" },
            { key: "invoiceAmount", label: "Invoice Amount", type: "number" },
            { key: "paymentAmount", label: "Payment Amount", type: "number" },
            { key: "tds", label: "TDS", type: "number" },
            { key: "gstTaxHold", label: "GST Tax Hold", type: "number" },
            { key: "gstTaxPaid", label: "GST Tax Paid", type: "number" },
          ],
        },
      },
    };

    return configs[orgCode] || configs["KIWI"];
  }

  private setColumnWidths(worksheet: XLSX.WorkSheet, data: any[]): void {
    if (!data || data.length === 0) return;

    const columnWidths: any[] = [];
    const headers = Object.keys(data[0]);

    headers.forEach((header, index) => {
      let maxWidth = header.length;

      data.forEach((row) => {
        const cellValue = row[header];
        if (cellValue !== null && cellValue !== undefined) {
          const cellLength = cellValue.toString().length;
          maxWidth = Math.max(maxWidth, cellLength);
        }
      });

      maxWidth = Math.min(Math.max(maxWidth + 2, 10), 50);
      columnWidths[index] = { width: maxWidth };
    });

    worksheet["!cols"] = columnWidths;
  }

  private normalizeGSTRate(value: any): string {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const stringValue = String(value).trim();

    if (stringValue.endsWith("%")) {
      return stringValue.slice(0, -1);
    }

    return stringValue;
  }

  private formatHeaders(data: any[]): any[] {
    return data.map((row) => {
      const formattedRow: any = {};
      Object.keys(row).forEach((key) => {
        let formattedKey = key
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        if (key === "total_igst" && this.isUBoardPurchaseOrder(row)) {
          formattedKey = "Total GST";
        }

        formattedRow[formattedKey] = row[key];
      });
      return formattedRow;
    });
  }

  private isUBoardPurchaseOrder(row: any): boolean {
    return (
      row.organization === "UBOARD" && row.document_type === "Purchase Order"
    );
  }

  private formatDateForExcel(date: any): string {
    if (!date) return "";

    try {
      let dateObj: Date | null = null;

      if (date instanceof Date) {
        dateObj = date;
      } else if (typeof date === "string") {
        if (date.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
          const [day, month, year] = date.split("-");
          dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day)
          );
        } else if (date.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
          const [day, month, year] = date.split("/");
          dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day)
          );
        } else if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dateObj = new Date(date);
        } else {
          dateObj = new Date(date);
        }
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        const day = String(dateObj.getDate()).padStart(2, "0");
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const year = dateObj.getFullYear();
        return `${day}-${month}-${year}`;
      }

      return String(date);
    } catch (error) {
      return String(date);
    }
  }

  async exportDocumentsToExcel(
    documentIds: string[],
    organizationId: string,
    organizationCode?: string
  ): Promise<Buffer> {
    try {
      logger.info(`Starting export for ${documentIds.length} documents`);

      const organization = await Organization.findById(organizationId);
      const orgCode = organizationCode || organization?.code || "KIWI";
      const orgConfig = this.getOrganizationFieldConfig(orgCode);

      const documents = await Promise.all(
        documentIds.map(async (id) => {
          try {
            const [invoice, purchaseOrder, grn, paymentAdvice] =
              await Promise.all([
                Invoice.findById(id).lean(),
                PurchaseOrder.findById(id).lean(),
                GRN.findById(id).lean(),
                PaymentAdvice.findById(id).lean(),
              ]);

            let doc = null;
            let docType = "";

            if (invoice) {
              doc = {
                ...invoice,
                document_type: invoice.document_type || "Invoice",
                extracted_data: invoice.invoice_data,
              };
              docType = "Invoice";
            } else if (purchaseOrder) {
              doc = {
                ...purchaseOrder,
                document_type: "Purchase Order",
                extracted_data: purchaseOrder.purchase_order_data,
              };
              docType = "Purchase Order";
            } else if (grn) {
              doc = {
                ...grn,
                document_type: "GRN",
                extracted_data: grn.grn_data,
              };
              docType = "GRN";
            } else if (paymentAdvice) {
              doc = {
                ...paymentAdvice,
                document_type: "Payment Advice",
                extracted_data: paymentAdvice.payment_advice_data,
              };
              docType = "Payment Advice";
            }

            if (!doc) {
              return null;
            }

            return doc;
          } catch (error) {
            logger.error(`Error fetching document ${id}:`, error);
            return null;
          }
        })
      );

      const validDocuments = documents.filter((doc) => {
        if (!doc) return false;
        if (!doc.extracted_data) {
          return false;
        }
        if (doc.extracted_data.error) {
          return false;
        }
        return true;
      });

      if (validDocuments.length === 0) {
        throw new Error("No valid documents found for export");
      }

      const headerData: any[] = [];
      const lineItemsData: any[] = [];

      for (const doc of validDocuments) {
        const docType = doc.document_type;
        const extractedData = doc.extracted_data;
        const docConfig = orgConfig[docType];

        if (!docConfig) {
          continue;
        }

        const getDocumentNumber = () => {
          if (docType === "Invoice") {
            return (
              extractedData.invoiceNumber || extractedData.supplierName || ""
            );
          } else if (docType === "Purchase Order") {
            return extractedData.poNumber || "";
          } else if (docType === "GRN") {
            return extractedData.grnNumber || "";
          } else if (docType === "Payment Advice") {
            return extractedData.documentNumber || "";
          }
          return "";
        };

        const headerRow: any = {
          document_id: doc._id.toString(),
          document_type: docType,
          document_number: getDocumentNumber(),
          file_name: doc.file_name,
          status:
            doc.status?.charAt(0).toUpperCase() +
              doc.status?.slice(1).replace("-", " ") || "Unknown",
          created_date: new Date(doc.createdAt).toLocaleDateString("en-GB"),
          approval_date: doc.approval_date
            ? this.formatDateForExcel(doc.approval_date)
            : "",
          organization: orgCode,
        };

        docConfig.fields.forEach((field) => {
          let fieldValue = extractedData[field.key] || "";
          if (field.type === "date" && fieldValue) {
            fieldValue = this.formatDateForExcel(fieldValue);
          }
          let fieldKey = field.label.toLowerCase().replace(/\s+/g, "_");
          if (
            field.key === "totalIGST" &&
            orgCode === "UBOARD" &&
            docType === "Purchase Order"
          ) {
            fieldKey = "total_gst";
          }
          headerRow[fieldKey] = fieldValue;
        });

        headerData.push(headerRow);

        if (extractedData.items && Array.isArray(extractedData.items)) {
          extractedData.items.forEach((item: any, index: number) => {
            const lineItemRow: any = {
              document_id: doc._id.toString(),
              document_type: docType,
              document_number: getDocumentNumber(),
              line_number: index + 1,
              organization: orgCode,
              approval_date: doc.approval_date
                ? this.formatDateForExcel(doc.approval_date)
                : "",
            };

            if (docType === "Invoice") {
              lineItemRow.invoice_number = extractedData.invoiceNumber || "";
            } else if (docType === "Purchase Order") {
              lineItemRow.po_number = extractedData.poNumber || "";
            } else if (docType === "GRN") {
              lineItemRow.grn_number = extractedData.grnNumber || "";
            } else if (docType === "Payment Advice") {
              lineItemRow.payment_advice_document_number =
                extractedData.documentNumber || "";
            }

            docConfig.itemFields.forEach((field) => {
              let fieldValue = item[field.key] || "";

              if (field.key === "gstRate") {
                fieldValue = this.normalizeGSTRate(fieldValue);
              }

              lineItemRow[field.label.toLowerCase().replace(/\s+/g, "_")] =
                fieldValue;
            });

            lineItemsData.push(lineItemRow);
          });
        }
      }

      const workbook = XLSX.utils.book_new();

      const formattedHeaderData = this.formatHeaders(headerData);
      const headerWorksheet = XLSX.utils.json_to_sheet(formattedHeaderData);
      this.setColumnWidths(headerWorksheet, formattedHeaderData);

      const headerRange = XLSX.utils.decode_range(
        headerWorksheet["!ref"] || ""
      );
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (headerWorksheet[cellAddress]) {
          headerWorksheet[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "366092" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }

      XLSX.utils.book_append_sheet(workbook, headerWorksheet, "Header");

      const formattedLineItemsData = this.formatHeaders(lineItemsData);
      const lineItemsWorksheet = XLSX.utils.json_to_sheet(
        formattedLineItemsData
      );
      this.setColumnWidths(lineItemsWorksheet, formattedLineItemsData);

      const lineItemsRange = XLSX.utils.decode_range(
        lineItemsWorksheet["!ref"] || ""
      );
      for (let col = lineItemsRange.s.c; col <= lineItemsRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (lineItemsWorksheet[cellAddress]) {
          lineItemsWorksheet[cellAddress].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "366092" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }

      XLSX.utils.book_append_sheet(workbook, lineItemsWorksheet, "Line Items");

      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
        cellStyles: true,
      });

      return excelBuffer;
    } catch (error) {
      logger.error("Error exporting documents to Excel:", error);
      throw new Error(`Failed to export documents: ${error.message}`);
    }
  }
}
export default new DocumentService();
