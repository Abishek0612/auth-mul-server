export interface POSummary {
  totalPOs: number;
  open: number;
  partiallyInvoiced: number;
  fullyInvoiced: number;
  overInvoiced: number;
  noGRNYet: number;
  partiallyReceived: number;
  fullyReceived: number;
  overReceived: number;
  hasRejections: number;
}

export interface InvoiceSummary {
  totalInvoices: number;
  noPO: number;
  poLinked: number;
  missingGRN: number;
  grnUnder: number;
  grnMatched: number;
  grnOver: number;
  hasRejections: number;
}

export interface GRNSummary {
  totalGRNs: number;
  missingInvoice: number;
  underVsInvoice: number;
  matchedVsInvoice: number;
  overVsInvoice: number;
  fullyAccepted: number;
  partiallyAccepted: number;
}

export interface WorkspaceFilters {
  dateRange?: { from: string; to: string };
  dateType?: "poDate" | "invoiceDate" | "grnDate";
  site?: string[];
  city?: string[];
  article?: string;
  search?: string;
  invoiceStatus?: string[];
  grnStatus?: string[];
  poStatus?: string[];
  acceptanceStatus?: string[];
  buyer?: string[];
  seller?: string[];
}

export interface PaginationParams {
  page: number;
  limit: number;
}
