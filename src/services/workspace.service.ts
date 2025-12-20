import { WorkspaceCalculations } from "../utils/workspace/calculations";
import { WorkspaceFilters, PaginationParams } from "../types/workspace.types";
import grnModel from "../models/grn.model";
import invoiceModel from "../models/invoice.model";
import purchaseorderModel from "../models/purchaseorder.model";

export class WorkspaceService {
  async getPOWorkspace(
    organizationId: string,
    filters: WorkspaceFilters,
    pagination: PaginationParams
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    let query: any = {
      organization: organizationId,
      active: true,
    };

    if (filters.dateRange && filters.dateType === "poDate") {
      query["purchase_order_data.poDate"] = {
        $gte: new Date(filters.dateRange.from),
        $lte: new Date(filters.dateRange.to),
      };
    }

    if (filters.site && filters.site.length > 0) {
      query["purchase_order_data.site"] = { $in: filters.site };
    }

    const totalCount = await purchaseorderModel.countDocuments(query);
    const pos = await purchaseorderModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .lean();

    const enrichedPOs = await Promise.all(
      pos.map(async (po) => {
        const poData = po.purchase_order_data || {};
        const poNumber = poData.poNumber || "";
        const poQty = parseFloat(poData.totalQty) || 0;

        const invoices = await invoiceModel
          .find({
            organization: organizationId,
            active: true,
            status: "approved",
            "invoice_data.buyerOrderNo": poNumber,
          })
          .lean();

        const grns = await grnModel
          .find({
            organization: organizationId,
            active: true,
            status: "approved",
            "grn_data.poNumber": poNumber,
          })
          .lean();

        const invoicedQty =
          WorkspaceCalculations.calculateInvoicedQty(invoices);
        const invoicedValue =
          WorkspaceCalculations.calculateInvoicedValue(invoices);
        const grnAcceptedQty =
          WorkspaceCalculations.calculateGRNAcceptedQty(grns);
        const grnRejectedQty =
          WorkspaceCalculations.calculateGRNRejectedQty(grns);

        const invoiceStatus = WorkspaceCalculations.getPOInvoiceStatus(
          poQty,
          invoicedQty
        );
        const grnStatus = WorkspaceCalculations.getPOGRNStatus(
          poQty,
          grnAcceptedQty,
          grnRejectedQty > 0
        );

        const qtyInvoicedPercent =
          poQty > 0 ? ((invoicedQty / poQty) * 100).toFixed(1) : "0.0";

        return {
          id: po._id.toString(),
          poNumber: poNumber,
          poDate: poData.poDate,
          buyer: poData.buyerName,
          seller: poData.sellerName,
          site: poData.site,
          city: poData.city || "-",
          poValue: parseFloat(poData.totalOrderValue) || 0,
          poQty: poQty,
          invoicedQty: invoicedQty,
          invoicedValue: invoicedValue,
          grnQty: grnAcceptedQty,
          qtyInvoicedPercent: `${qtyInvoicedPercent}%`,
          invoiceStatus: invoiceStatus,
          grnStatus: grnStatus,
        };
      })
    );

    let filteredPOs = enrichedPOs;

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredPOs = filteredPOs.filter(
        (po) =>
          po.poNumber.toLowerCase().includes(searchLower) ||
          po.buyer.toLowerCase().includes(searchLower) ||
          po.seller.toLowerCase().includes(searchLower)
      );
    }

    if (filters.invoiceStatus && filters.invoiceStatus.length > 0) {
      filteredPOs = filteredPOs.filter((po) =>
        filters.invoiceStatus!.includes(po.invoiceStatus)
      );
    }

    if (filters.grnStatus && filters.grnStatus.length > 0) {
      filteredPOs = filteredPOs.filter((po) =>
        po.grnStatus.some((status) => filters.grnStatus!.includes(status))
      );
    }

    const summary = this.calculatePOSummary(enrichedPOs);
    const totals = this.calculatePOTotals(filteredPOs);

    return {
      documents: filteredPOs,
      summary,
      totals,
      pagination: {
        total: totalCount,
        page,
        pages: Math.ceil(totalCount / limit),
        limit,
      },
    };
  }

  async getInvoiceWorkspace(
    organizationId: string,
    filters: WorkspaceFilters,
    pagination: PaginationParams
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    let query: any = {
      organization: organizationId,
      active: true,
      status: "approved",
    };

    if (filters.dateRange && filters.dateType === "invoiceDate") {
      query["invoice_data.invoiceDate"] = {
        $gte: new Date(filters.dateRange.from),
        $lte: new Date(filters.dateRange.to),
      };
    }

    const totalCount = await invoiceModel.countDocuments(query);
    const invoices = await invoiceModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .lean();

    const enrichedInvoices = await Promise.all(
      invoices.map(async (invoice) => {
        const invData = invoice.invoice_data || {};
        const invoiceNumber = invData.invoiceNumber || "";
        const buyerOrderNo = invData.buyerOrderNo || "";
        const invoiceQty = parseFloat(invData.invoiceQty) || 0;

        const po = await purchaseorderModel
          .findOne({
            organization: organizationId,
            active: true,
            "purchase_order_data.poNumber": buyerOrderNo,
          })
          .lean();

        const grn = await grnModel
          .findOne({
            organization: organizationId,
            active: true,
            status: "approved",
            "grn_data.vendorInvoiceNo": invoiceNumber,
          })
          .lean();

        let grnAcceptedQty = 0;
        let grnRejectedQty = 0;

        if (grn) {
          const grnData = grn.grn_data || {};
          const items = grnData.items || [];
          grnAcceptedQty = items.reduce((sum: number, item: any) => {
            return sum + (parseFloat(item.acceptedQty) || 0);
          }, 0);
          grnRejectedQty = items.reduce((sum: number, item: any) => {
            const received = parseFloat(item.receivedQty) || 0;
            const accepted = parseFloat(item.acceptedQty) || 0;
            return sum + (received - accepted);
          }, 0);
        }

        const poStatus = WorkspaceCalculations.getInvoicePOStatus(!!po);
        const grnStatus = WorkspaceCalculations.getInvoiceGRNStatus(
          invoiceQty,
          grnAcceptedQty,
          !!grn,
          grnRejectedQty > 0
        );

        return {
          id: invoice._id.toString(),
          invoiceNumber: invoiceNumber,
          invoiceDate: invData.invoiceDate,
          buyer: invData.buyerName,
          seller: invData.sellerName,
          site: po?.purchase_order_data?.site || "Unknown",
          city: po?.purchase_order_data?.city || "Unknown",
          poNumber: buyerOrderNo,
          invoiceQty: invoiceQty,
          grnAcceptedQty: grnAcceptedQty,
          grossAmount: parseFloat(invData.grossAmount) || 0,
          gstAmount: parseFloat(invData.gstAmount) || 0,
          totalAmount: parseFloat(invData.totalAmount) || 0,
          poStatus: poStatus,
          grnStatus: grnStatus,
        };
      })
    );

    let filteredInvoices = enrichedInvoices;

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredInvoices = filteredInvoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(searchLower) ||
          inv.poNumber.toLowerCase().includes(searchLower) ||
          inv.buyer.toLowerCase().includes(searchLower)
      );
    }

    if (filters.poStatus && filters.poStatus.length > 0) {
      filteredInvoices = filteredInvoices.filter((inv) =>
        filters.poStatus!.includes(inv.poStatus)
      );
    }

    if (filters.grnStatus && filters.grnStatus.length > 0) {
      filteredInvoices = filteredInvoices.filter((inv) =>
        inv.grnStatus.some((status) => filters.grnStatus!.includes(status))
      );
    }

    const summary = this.calculateInvoiceSummary(enrichedInvoices);
    const totals = this.calculateInvoiceTotals(filteredInvoices);

    return {
      documents: filteredInvoices,
      summary,
      totals,
      pagination: {
        total: totalCount,
        page,
        pages: Math.ceil(totalCount / limit),
        limit,
      },
    };
  }

  async getGRNWorkspace(
    organizationId: string,
    filters: WorkspaceFilters,
    pagination: PaginationParams
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    let query: any = {
      organization: organizationId,
      active: true,
      status: "approved",
    };

    if (filters.dateRange && filters.dateType === "grnDate") {
      query["grn_data.grnDate"] = {
        $gte: new Date(filters.dateRange.from),
        $lte: new Date(filters.dateRange.to),
      };
    }

    const totalCount = await grnModel.countDocuments(query);
    const grns = await grnModel.find(query).skip(skip).limit(limit).lean();

    const enrichedGRNs = await Promise.all(
      grns.map(async (grn) => {
        const grnData = grn.grn_data || {};
        const grnNumber = grnData.grnNumber || "";
        const vendorInvoiceNo = grnData.vendorInvoiceNo || "";
        const poNumber = grnData.poNumber || "";
        const items = grnData.items || [];

        const receivedQty = items.reduce((sum: number, item: any) => {
          return sum + (parseFloat(item.receivedQty) || 0);
        }, 0);

        const acceptedQty = items.reduce((sum: number, item: any) => {
          return sum + (parseFloat(item.acceptedQty) || 0);
        }, 0);

        const rejectedQty = receivedQty - acceptedQty;

        const invoice = await invoiceModel
          .findOne({
            organization: organizationId,
            active: true,
            status: "approved",
            "invoice_data.invoiceNumber": vendorInvoiceNo,
          })
          .lean();

        const po = await purchaseorderModel
          .findOne({
            organization: organizationId,
            active: true,
            "purchase_order_data.poNumber": poNumber,
          })
          .lean();

        const invoiceQty = invoice
          ? parseFloat(invoice.invoice_data?.invoiceQty) || 0
          : 0;

        const invoiceStatus = WorkspaceCalculations.getGRNInvoiceStatus(
          acceptedQty,
          invoiceQty,
          !!invoice
        );

        const acceptanceStatus =
          WorkspaceCalculations.getGRNAcceptanceStatus(rejectedQty);

        return {
          id: grn._id.toString(),
          grnNumber: grnNumber,
          grnDate: grnData.grnDate,
          buyer: grnData.buyerName,
          seller: grnData.sellerName,
          site: po?.purchase_order_data?.site || "Unknown",
          city: po?.purchase_order_data?.city || "Unknown",
          poNumber: poNumber,
          invoiceNumber: vendorInvoiceNo,
          invoiceQty: invoiceQty,
          receivedQty: receivedQty,
          acceptedQty: acceptedQty,
          rejectedQty: rejectedQty,
          invoiceStatus: invoiceStatus,
          acceptanceStatus: acceptanceStatus,
        };
      })
    );

    let filteredGRNs = enrichedGRNs;

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredGRNs = filteredGRNs.filter(
        (grn) =>
          grn.grnNumber.toLowerCase().includes(searchLower) ||
          grn.invoiceNumber.toLowerCase().includes(searchLower) ||
          grn.poNumber.toLowerCase().includes(searchLower)
      );
    }

    const summary = this.calculateGRNSummary(enrichedGRNs);
    const totals = this.calculateGRNTotals(filteredGRNs);

    return {
      documents: filteredGRNs,
      summary,
      totals,
      pagination: {
        total: totalCount,
        page,
        pages: Math.ceil(totalCount / limit),
        limit,
      },
    };
  }

  private calculatePOSummary(pos: any[]) {
    return {
      totalPOs: pos.length,
      open: pos.filter((p) => p.invoiceStatus === "Open").length,
      partiallyInvoiced: pos.filter(
        (p) => p.invoiceStatus === "Partially Invoiced"
      ).length,
      fullyInvoiced: pos.filter((p) => p.invoiceStatus === "Fully Invoiced")
        .length,
      overInvoiced: pos.filter((p) => p.invoiceStatus === "Over Invoiced")
        .length,
      noGRNYet: pos.filter((p) => p.grnStatus.includes("No GRN Yet")).length,
      partiallyReceived: pos.filter((p) =>
        p.grnStatus.includes("Partially Received")
      ).length,
      fullyReceived: pos.filter((p) => p.grnStatus.includes("Fully Received"))
        .length,
      overReceived: pos.filter((p) => p.grnStatus.includes("Over Received"))
        .length,
      hasRejections: pos.filter((p) => p.grnStatus.includes("Has Rejections"))
        .length,
    };
  }

  private calculatePOTotals(pos: any[]) {
    return {
      rows: pos.length,
      poValue: pos.reduce((sum, p) => sum + p.poValue, 0),
      poQty: pos.reduce((sum, p) => sum + p.poQty, 0),
      invoicedQty: pos.reduce((sum, p) => sum + p.invoicedQty, 0),
      grnQty: pos.reduce((sum, p) => sum + p.grnQty, 0),
      avgQtyInvoiced:
        pos.length > 0
          ? (
              pos.reduce((sum, p) => {
                return sum + parseFloat(p.qtyInvoicedPercent);
              }, 0) / pos.length
            ).toFixed(1) + "%"
          : "0.0%",
    };
  }

  private calculateInvoiceSummary(invoices: any[]) {
    return {
      totalInvoices: invoices.length,
      noPO: invoices.filter((i) => i.poStatus === "No PO").length,
      poLinked: invoices.filter((i) => i.poStatus === "PO Linked").length,
      missingGRN: invoices.filter((i) => i.grnStatus.includes("Missing GRN"))
        .length,
      grnUnder: invoices.filter((i) => i.grnStatus.includes("GRN Under"))
        .length,
      grnMatched: invoices.filter((i) => i.grnStatus.includes("GRN Matched"))
        .length,
      grnOver: invoices.filter((i) => i.grnStatus.includes("GRN Over")).length,
      hasRejections: invoices.filter((i) =>
        i.grnStatus.includes("Has Rejections")
      ).length,
    };
  }

  private calculateInvoiceTotals(invoices: any[]) {
    return {
      rows: invoices.length,
      invoiceQty: invoices.reduce((sum, i) => sum + i.invoiceQty, 0),
      grnAcceptedQty: invoices.reduce((sum, i) => sum + i.grnAcceptedQty, 0),
      grossAmount: invoices.reduce((sum, i) => sum + i.grossAmount, 0),
      gstAmount: invoices.reduce((sum, i) => sum + i.gstAmount, 0),
      totalAmount: invoices.reduce((sum, i) => sum + i.totalAmount, 0),
    };
  }

  private calculateGRNSummary(grns: any[]) {
    return {
      totalGRNs: grns.length,
      missingInvoice: grns.filter((g) => g.invoiceStatus === "Missing Invoice")
        .length,
      underVsInvoice: grns.filter((g) => g.invoiceStatus === "Under vs Invoice")
        .length,
      matchedVsInvoice: grns.filter(
        (g) => g.invoiceStatus === "Matched vs Invoice"
      ).length,
      overVsInvoice: grns.filter((g) => g.invoiceStatus === "Over vs Invoice")
        .length,
      fullyAccepted: grns.filter((g) => g.acceptanceStatus === "Fully Accepted")
        .length,
      partiallyAccepted: grns.filter(
        (g) => g.acceptanceStatus === "Partially Accepted"
      ).length,
    };
  }

  private calculateGRNTotals(grns: any[]) {
    return {
      rows: grns.length,
      invoiceQty: grns.reduce((sum, g) => sum + g.invoiceQty, 0),
      receivedQty: grns.reduce((sum, g) => sum + g.receivedQty, 0),
      acceptedQty: grns.reduce((sum, g) => sum + g.acceptedQty, 0),
      rejectedQty: grns.reduce((sum, g) => sum + g.rejectedQty, 0),
    };
  }
}

export default new WorkspaceService();
