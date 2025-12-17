import Invoice from "../models/invoice.model";
import PurchaseOrder from "../models/purchaseorder.model";
import GRN from "../models/grn.model";
import logger from "../config/logger";
import { Types } from "mongoose";

interface WorkspaceFilters {
  dateRange: {
    from?: string;
    to?: string;
  };
  site?: string;
  city?: string;
  buyer?: string;
  seller?: string;
  status?: string;
  search?: string;
}

class WorkspaceService {
  async getPOWorkspaceData(organizationId: string, filters: WorkspaceFilters) {
    try {
      const orgId = new Types.ObjectId(organizationId);

      const pos = await PurchaseOrder.find({
        organization: orgId,
        active: true,
      }).lean();

      logger.info(`Found ${pos.length} total POs`);

      const posWithData = pos.filter((po) => {
        const poData = po.purchase_order_data;
        const hasValidData = poData && poData.poNumber && !poData.error;
        if (!hasValidData) {
          logger.warn(
            `PO ${po._id} filtered out - hasData: ${!!poData}, poNumber: ${
              poData?.poNumber
            }, error: ${poData?.error}`
          );
        }
        return hasValidData;
      });

      logger.info(`${posWithData.length} POs have valid data`);

      const invoices = await Invoice.find({
        organization: orgId,
        active: true,
      }).lean();

      const grns = await GRN.find({
        organization: orgId,
        active: true,
      }).lean();

      const poWorkspaceData = posWithData.map((po) => {
        const poData = po.purchase_order_data || {};
        const poNumber = poData.poNumber || "";

        const linkedInvoices = invoices.filter((inv) => {
          const invData = inv.invoice_data || {};
          return invData.buyerOrderNo === poNumber;
        });

        const linkedGRNs = grns.filter((grn) => {
          const grnData = grn.grn_data || {};
          return grnData.poNumber === poNumber;
        });

        const totalInvoiceQty = linkedInvoices.reduce((sum, inv) => {
          const invData = inv.invoice_data || {};
          return sum + (parseFloat(invData.invoiceQty) || 0);
        }, 0);

        const totalInvoiceValue = linkedInvoices.reduce((sum, inv) => {
          const invData = inv.invoice_data || {};
          return sum + (parseFloat(invData.totalAmount) || 0);
        }, 0);

        const totalGRNQty = linkedGRNs.reduce((sum, grn) => {
          const grnData = grn.grn_data || {};
          return sum + (parseFloat(grnData.grnQty) || 0);
        }, 0);

        const poQty = parseFloat(poData.totalQty) || 0;
        const poValue = parseFloat(poData.totalOrderValue) || 0;

        let status = "Open";
        if (totalInvoiceQty === 0) {
          status = "Open";
        } else if (totalInvoiceQty < poQty) {
          status = "Partially Invoiced";
        } else if (totalInvoiceQty === poQty) {
          status = "Fully Invoiced";
        } else if (totalInvoiceQty > poQty) {
          status = "Over Invoiced";
        }

        const qtyInvoicedPercent =
          poQty > 0 ? ((totalInvoiceQty / poQty) * 100).toFixed(1) : "0.0";
        const valueInvoicedPercent =
          poValue > 0
            ? ((totalInvoiceValue / poValue) * 100).toFixed(1)
            : "0.0";

        return {
          id: po._id.toString(),
          poNumber: poNumber,
          poDate: poData.poDate || "",
          buyer: poData.buyerName || "",
          seller: poData.sellerName || "",
          site: poData.site || "",
          city: poData.city || "",
          poQty: poQty,
          invoicedQty: totalInvoiceQty,
          grnQty: totalGRNQty,
          poValue: poValue.toFixed(2),
          invoicedValue: totalInvoiceValue.toFixed(2),
          qtyInvoicedPercent: `${qtyInvoicedPercent}%`,
          valueInvoicedPercent: `${valueInvoicedPercent}%`,
          status: status,
          linkedInvoicesCount: linkedInvoices.length,
          linkedGRNsCount: linkedGRNs.length,
        };
      });

      let filteredData = poWorkspaceData;

      if (filters.dateRange?.from || filters.dateRange?.to) {
        filteredData = filteredData.filter((po) => {
          if (!po.poDate) return false;
          const poDate = new Date(po.poDate);
          if (filters.dateRange.from) {
            const fromDate = new Date(filters.dateRange.from);
            if (poDate < fromDate) return false;
          }
          if (filters.dateRange.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (poDate > toDate) return false;
          }
          return true;
        });
      }

      if (filters.site && filters.site !== "All Sites") {
        filteredData = filteredData.filter((po) => po.site === filters.site);
      }

      if (filters.buyer && filters.buyer !== "All Buyers") {
        filteredData = filteredData.filter((po) => po.buyer === filters.buyer);
      }

      if (filters.seller && filters.seller !== "All Sellers") {
        filteredData = filteredData.filter(
          (po) => po.seller === filters.seller
        );
      }

      if (filters.status && filters.status !== "All Statuses") {
        filteredData = filteredData.filter(
          (po) => po.status === filters.status
        );
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredData = filteredData.filter(
          (po) =>
            po.poNumber.toLowerCase().includes(searchLower) ||
            po.buyer.toLowerCase().includes(searchLower) ||
            po.seller.toLowerCase().includes(searchLower) ||
            po.site.toLowerCase().includes(searchLower)
        );
      }

      const summary = {
        totalPOs: poWorkspaceData.length,
        open: poWorkspaceData.filter((po) => po.status === "Open").length,
        partiallyInvoiced: poWorkspaceData.filter(
          (po) => po.status === "Partially Invoiced"
        ).length,
        fullyInvoiced: poWorkspaceData.filter(
          (po) => po.status === "Fully Invoiced"
        ).length,
        overInvoiced: poWorkspaceData.filter(
          (po) => po.status === "Over Invoiced"
        ).length,
      };

      const sites = [...new Set(poWorkspaceData.map((po) => po.site))].filter(
        Boolean
      );
      const buyers = [...new Set(poWorkspaceData.map((po) => po.buyer))].filter(
        Boolean
      );
      const sellers = [
        ...new Set(poWorkspaceData.map((po) => po.seller)),
      ].filter(Boolean);

      return {
        summary,
        pos: filteredData,
        filters: {
          sites: ["All Sites", ...sites],
          buyers: ["All Buyers", ...buyers],
          sellers: ["All Sellers", ...sellers],
          statuses: [
            "All Statuses",
            "Open",
            "Partially Invoiced",
            "Fully Invoiced",
            "Over Invoiced",
          ],
        },
      };
    } catch (error) {
      logger.error("Error in getPOWorkspaceData:", error);
      throw error;
    }
  }

  async getPODetails(poId: string) {
    try {
      const po = await PurchaseOrder.findById(poId).lean();

      if (!po) {
        throw new Error("Purchase Order not found");
      }

      const poData = po.purchase_order_data || {};
      const poNumber = poData.poNumber || "";

      const linkedInvoices = await Invoice.find({
        organization: po.organization,
        active: true,
      }).lean();

      const filteredInvoices = linkedInvoices.filter((inv) => {
        const invData = inv.invoice_data || {};
        return invData.buyerOrderNo === poNumber;
      });

      const linkedGRNs = await GRN.find({
        organization: po.organization,
        active: true,
      }).lean();

      const filteredGRNs = linkedGRNs.filter((grn) => {
        const grnData = grn.grn_data || {};
        return grnData.poNumber === poNumber;
      });

      const totalInvoiceQty = filteredInvoices.reduce((sum, inv) => {
        const invData = inv.invoice_data || {};
        return sum + (parseFloat(invData.invoiceQty) || 0);
      }, 0);

      const totalInvoiceValue = filteredInvoices.reduce((sum, inv) => {
        const invData = inv.invoice_data || {};
        return sum + (parseFloat(invData.totalAmount) || 0);
      }, 0);

      const totalGRNQty = filteredGRNs.reduce((sum, grn) => {
        const grnData = grn.grn_data || {};
        return sum + (parseFloat(grnData.grnQty) || 0);
      }, 0);

      const poQty = parseFloat(poData.totalQty) || 0;
      const poValue = parseFloat(poData.totalOrderValue) || 0;

      const qtyInvoicedPercent =
        poQty > 0 ? ((totalInvoiceQty / poQty) * 100).toFixed(1) : "0.0";

      return {
        po: {
          id: po._id.toString(),
          ...poData,
        },
        summary: {
          invoicedValue: totalInvoiceValue.toFixed(2),
          invoicedQty: totalInvoiceQty,
          grnQty: totalGRNQty,
          qtyInvoicedPercent: `${qtyInvoicedPercent}%`,
        },
        linkedInvoices: filteredInvoices.map((inv) => ({
          id: inv._id.toString(),
          invoiceNumber: inv.invoice_data?.invoiceNumber || "",
          invoiceDate: inv.invoice_data?.invoiceDate || "",
          invoiceQty: inv.invoice_data?.invoiceQty || 0,
          grossAmount: inv.invoice_data?.grossAmount || 0,
          gstAmount: inv.invoice_data?.gstAmount || 0,
          totalAmount: inv.invoice_data?.totalAmount || 0,
        })),
        linkedGRNs: filteredGRNs.map((grn) => ({
          id: grn._id.toString(),
          grnNumber: grn.grn_data?.grnNumber || "",
          grnDate: grn.grn_data?.grnDate || "",
          grnQty: grn.grn_data?.grnQty || 0,
          vendorInvoiceNo: grn.grn_data?.vendorInvoiceNo || "",
        })),
      };
    } catch (error) {
      logger.error("Error in getPODetails:", error);
      throw error;
    }
  }

  async getInvoiceWorkspaceData(
    organizationId: string,
    filters: WorkspaceFilters
  ) {
    try {
      const orgId = new Types.ObjectId(organizationId);

      const invoices = await Invoice.find({
        organization: orgId,
        active: true,
      }).lean();

      const invoicesWithData = invoices.filter((inv) => {
        const invData = inv.invoice_data;
        return invData && invData.invoiceNumber && !invData.error;
      });

      let filteredInvoices = invoicesWithData;

      if (filters.dateRange?.from || filters.dateRange?.to) {
        filteredInvoices = filteredInvoices.filter((inv) => {
          const invDate = inv.invoice_data?.invoiceDate;
          if (!invDate) return false;
          const invoiceDate = new Date(invDate);
          if (filters.dateRange.from) {
            const fromDate = new Date(filters.dateRange.from);
            if (invoiceDate < fromDate) return false;
          }
          if (filters.dateRange.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (invoiceDate > toDate) return false;
          }
          return true;
        });
      }

      if (filters.buyer && filters.buyer !== "All Buyers") {
        filteredInvoices = filteredInvoices.filter(
          (inv) => inv.invoice_data?.buyerName === filters.buyer
        );
      }

      if (filters.seller && filters.seller !== "All Sellers") {
        filteredInvoices = filteredInvoices.filter(
          (inv) => inv.invoice_data?.sellerName === filters.seller
        );
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredInvoices = filteredInvoices.filter((inv) => {
          const data = inv.invoice_data || {};
          return (
            data.invoiceNumber?.toLowerCase().includes(searchLower) ||
            data.buyerName?.toLowerCase().includes(searchLower) ||
            data.sellerName?.toLowerCase().includes(searchLower) ||
            data.buyerOrderNo?.toLowerCase().includes(searchLower)
          );
        });
      }

      const buyers = [
        ...new Set(invoicesWithData.map((inv) => inv.invoice_data?.buyerName)),
      ].filter(Boolean);
      const sellers = [
        ...new Set(invoicesWithData.map((inv) => inv.invoice_data?.sellerName)),
      ].filter(Boolean);

      return {
        invoices: filteredInvoices.map((inv) => ({
          id: inv._id.toString(),
          invoiceNumber: inv.invoice_data?.invoiceNumber || "",
          buyerOrderNo: inv.invoice_data?.buyerOrderNo || "",
          invoiceDate: inv.invoice_data?.invoiceDate || "",
          buyerName: inv.invoice_data?.buyerName || "",
          sellerName: inv.invoice_data?.sellerName || "",
          invoiceQty: inv.invoice_data?.invoiceQty || 0,
          grossAmount: inv.invoice_data?.grossAmount || 0,
          gstAmount: inv.invoice_data?.gstAmount || 0,
          totalAmount: inv.invoice_data?.totalAmount || 0,
        })),
        filters: {
          buyers: ["All Buyers", ...buyers],
          sellers: ["All Sellers", ...sellers],
        },
      };
    } catch (error) {
      logger.error("Error in getInvoiceWorkspaceData:", error);
      throw error;
    }
  }

  async getGRNWorkspaceData(organizationId: string, filters: WorkspaceFilters) {
    try {
      const orgId = new Types.ObjectId(organizationId);

      const grns = await GRN.find({
        organization: orgId,
        active: true,
      }).lean();

      const grnsWithData = grns.filter((grn) => {
        const grnData = grn.grn_data;
        return grnData && grnData.grnNumber && !grnData.error;
      });

      let filteredGRNs = grnsWithData;

      if (filters.dateRange?.from || filters.dateRange?.to) {
        filteredGRNs = filteredGRNs.filter((grn) => {
          const grnDate = grn.grn_data?.grnDate;
          if (!grnDate) return false;
          const date = new Date(grnDate);
          if (filters.dateRange.from) {
            const fromDate = new Date(filters.dateRange.from);
            if (date < fromDate) return false;
          }
          if (filters.dateRange.to) {
            const toDate = new Date(filters.dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (date > toDate) return false;
          }
          return true;
        });
      }

      if (filters.buyer && filters.buyer !== "All Buyers") {
        filteredGRNs = filteredGRNs.filter(
          (grn) => grn.grn_data?.buyerName === filters.buyer
        );
      }

      if (filters.seller && filters.seller !== "All Sellers") {
        filteredGRNs = filteredGRNs.filter(
          (grn) => grn.grn_data?.sellerName === filters.seller
        );
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredGRNs = filteredGRNs.filter((grn) => {
          const data = grn.grn_data || {};
          return (
            data.grnNumber?.toLowerCase().includes(searchLower) ||
            data.buyerName?.toLowerCase().includes(searchLower) ||
            data.sellerName?.toLowerCase().includes(searchLower) ||
            data.poNumber?.toLowerCase().includes(searchLower) ||
            data.vendorInvoiceNo?.toLowerCase().includes(searchLower)
          );
        });
      }

      const buyers = [
        ...new Set(grnsWithData.map((grn) => grn.grn_data?.buyerName)),
      ].filter(Boolean);
      const sellers = [
        ...new Set(grnsWithData.map((grn) => grn.grn_data?.sellerName)),
      ].filter(Boolean);

      return {
        grns: filteredGRNs.map((grn) => ({
          id: grn._id.toString(),
          grnNumber: grn.grn_data?.grnNumber || "",
          grnDate: grn.grn_data?.grnDate || "",
          buyerName: grn.grn_data?.buyerName || "",
          sellerName: grn.grn_data?.sellerName || "",
          vendorInvoiceNo: grn.grn_data?.vendorInvoiceNo || "",
          poNumber: grn.grn_data?.poNumber || "",
          grnQty: grn.grn_data?.grnQty || 0,
        })),
        filters: {
          buyers: ["All Buyers", ...buyers],
          sellers: ["All Sellers", ...sellers],
        },
      };
    } catch (error) {
      logger.error("Error in getGRNWorkspaceData:", error);
      throw error;
    }
  }
}

export default new WorkspaceService();
