export class WorkspaceCalculations {
  static calculateInvoicedQty(invoices: any[]): number {
    return invoices.reduce((sum, inv) => {
      const invData = inv.invoice_data || {};
      return sum + (parseFloat(invData.invoiceQty) || 0);
    }, 0);
  }

  static calculateInvoicedValue(invoices: any[]): number {
    return invoices.reduce((sum, inv) => {
      const invData = inv.invoice_data || {};
      return sum + (parseFloat(invData.totalAmount) || 0);
    }, 0);
  }

  static calculateGRNAcceptedQty(grns: any[]): number {
    return grns.reduce((sum, grn) => {
      const grnData = grn.grn_data || {};
      const items = grnData.items || [];
      return (
        sum +
        items.reduce((itemSum: number, item: any) => {
          return itemSum + (parseFloat(item.acceptedQty) || 0);
        }, 0)
      );
    }, 0);
  }

  static calculateGRNRejectedQty(grns: any[]): number {
    return grns.reduce((sum, grn) => {
      const grnData = grn.grn_data || {};
      const items = grnData.items || [];
      return (
        sum +
        items.reduce((itemSum: number, item: any) => {
          const received = parseFloat(item.receivedQty) || 0;
          const accepted = parseFloat(item.acceptedQty) || 0;
          return itemSum + (received - accepted);
        }, 0)
      );
    }, 0);
  }

  static getPOInvoiceStatus(
    poQty: number,
    invoicedQty: number
  ): "Open" | "Partially Invoiced" | "Fully Invoiced" | "Over Invoiced" {
    if (invoicedQty === 0) return "Open";
    if (invoicedQty < poQty) return "Partially Invoiced";
    if (invoicedQty === poQty) return "Fully Invoiced";
    return "Over Invoiced";
  }

  static getPOGRNStatus(
    poQty: number,
    grnAcceptedQty: number,
    hasRejections: boolean
  ): string[] {
    const statuses: string[] = [];

    if (grnAcceptedQty === 0) {
      statuses.push("No GRN Yet");
    } else if (grnAcceptedQty < poQty) {
      statuses.push("Partially Received");
    } else if (grnAcceptedQty === poQty) {
      statuses.push("Fully Received");
    } else {
      statuses.push("Over Received");
    }

    if (hasRejections) {
      statuses.push("Has Rejections");
    }

    return statuses;
  }

  static getInvoicePOStatus(hasPO: boolean): "No PO" | "PO Linked" {
    return hasPO ? "PO Linked" : "No PO";
  }

  static getInvoiceGRNStatus(
    invoiceQty: number,
    grnAcceptedQty: number,
    hasGRN: boolean,
    hasRejections: boolean
  ): string[] {
    const statuses: string[] = [];

    if (!hasGRN) {
      statuses.push("Missing GRN");
    } else if (grnAcceptedQty < invoiceQty) {
      statuses.push("GRN Under");
    } else if (grnAcceptedQty === invoiceQty) {
      statuses.push("GRN Matched");
    } else {
      statuses.push("GRN Over");
    }

    if (hasRejections) {
      statuses.push("Has Rejections");
    }

    return statuses;
  }

  static getGRNInvoiceStatus(
    grnAcceptedQty: number,
    invoiceQty: number,
    hasInvoice: boolean
  ):
    | "Missing Invoice"
    | "Under vs Invoice"
    | "Matched vs Invoice"
    | "Over vs Invoice" {
    if (!hasInvoice) return "Missing Invoice";
    if (grnAcceptedQty < invoiceQty) return "Under vs Invoice";
    if (grnAcceptedQty === invoiceQty) return "Matched vs Invoice";
    return "Over vs Invoice";
  }

  static getGRNAcceptanceStatus(
    rejectedQty: number
  ): "Fully Accepted" | "Partially Accepted" {
    return rejectedQty === 0 ? "Fully Accepted" : "Partially Accepted";
  }
}
