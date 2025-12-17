require("dotenv").config();
const path = require("path");

const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
};

const distPath = path.resolve(__dirname, "../../dist");

let connectDB, Organization;

try {
  connectDB = require(path.join(distPath, "config/database")).default;
  Organization = require(path.join(
    distPath,
    "models/organization.model"
  )).default;
} catch (error) {
  logger.error(
    "Failed to load compiled modules. Run 'npm run build' first.",
    error.message
  );
  process.exit(1);
}

const Status = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  DELETE: "delete",
};

const organizations = [
  {
    name: "UBOARD",
    code: "UBOARD",
    status: Status.ACTIVE,
    invoice_prompt: `
    You are an expert GST-invoice parser.
Read the attached invoice (image or PDF) and return STRICTLY valid, minified JSON that matches the schema supplied by the user.
Rules
- Do NOT add or remove keys.  
- Use null for any field you cannot find.  
- Return numbers as raw decimals (no commas, no ₹ symbol).  
- Output the JSON object only – no markdown, no prose.  
- Never invent or guess amounts, dates, or codes.  
FIELD HINTS (do not echo)
invoiceNumber   : "Invoice No."
invoiceDate     : "Dated"  or date next to Invoice No. in dd-mm-yyyy format 
buyerOrderNo    : "Buyer's Order No." / "PO No."  
buyerName       : block headed Buyer (Bill to)
sellerName      : top-left header
invoiceQty      : total quantity near "Total … Pcs"
grossAmount     : "Taxable Value" total (pre-tax)  
gstAmount       : total IGST + CGST + SGST amount (look in tax table)  
totalAmount     : grand total in bold Rupee line (inclusive of GST)  
items[].articleNo : 9-digit code printed under each description line  
items[].itemName  : long description text  
items[].hsn        : HSN/SAC column (950300, etc.)  
items[].quantity   : qty column (e.g. 60)  
items[].qtyUnit    :Ex: "Pcs"; read column text  
items[].rate       : unit price before tax
items[].gstRate    : GST % column– null if blank  
items[].totalAmount    : line amount

    
    Extract all the information from this invoice and return as JSON with the following structure:
{
  "invoiceNumber": "string",
  "buyerOrderNo": "string", 
  "invoiceDate": "string",
  "buyerName": "string",
  "sellerName": "string",
  "invoiceQty": "number",
  "grossAmount": "number",
  "gstAmount": "number",
  "totalAmount": "number",
  "items": [
    {
      "articleNo": "string",
      "itemName": "string",
      "hsn": "string",
      "quantity": "number",
      "qtyUnit": "string",
      "rate": "number",
      "gstRate": "string",
      "totalAmount": "number"
    }
  ]
}`,
    purchaseorder_prompt: `
    You are an expert GST–purchase-order parser. Read the attached PO (image or PDF) and output STRICTLY valid, minified JSON that matches the schema supplied by the user. Rules • Do NOT add or remove keys. • Use null for any field you cannot find. • Return numbers as raw decimals (no commas, no ₹ symbol). • Output the JSON object only – no markdown, no prose. • Never invent or guess amounts, dates, or codes. • Mutual-exclusivity: if IGST percent/value is present (>0) for a line or total, then all CGST and SGST percent/value fields must be null; if CGST + SGST are present, IGST percent/value must be null. • Compute totalIGST as either the IGST amount (IGST case) or CGST + SGST (CGST/SGST case). • Compute totalOrderValue = totalBasicValue + totalIGST. FIELD HINTS (do not echo) poNumber : field labelled "PO NO." / "Purchase Order No." poDate : "PO Date" buyerName : issuer of the PO sellerName : Supplier block deliveryDate : "DELIVERY DATE" in dd-mm-yyyy format site : "Site : ..." - keep the code (e.g. THP1) or site name totalBasicValue : "TOTAL BASIC VALUE" (pre-tax) totalIGST : IGST amount or CGST + SGST total (see rules) totalOrderValue : "Total Order Value" (basic + GST, per rules) totalQty : grand-total quantity shown near "Grand Total of Qty" items[].articleNo : "Article No." column items[].hsn : "HSN Code" items[].eanNo : 12 or 13-digit EAN / barcode (null if absent) items[].description : material description text items[].quantity : quantity column items[].baseCost : "Base Cost" (unit, pre-tax) items[].igstPercent : "IGST (%)" (null if blank) items[].igstValue : IGST amount for the line (null if blank) items[].cgstPercent : "CGST (%)" (null if blank) items[].cgstValue : CGST amount for the line (null if blank) items[].sgstPercent : "SGST (%)" (null if blank) items[].sgstValue : SGST amount for the line (null if blank) items[].totalBaseValue : "Total Base Value" (quantity × baseCost) Extract all the information from this Purchase Order and return as JSON with the following structure: { "poNumber": "string", "poDate": "string", "buyerName": "string", "sellerName": "string", "deliveryDate": "string", "site": "string", "totalBasicValue": "number", "totalIGST": "number", "totalOrderValue": "number", "totalQty": "number", "items": [ { "articleNo": "string", "hsn": "string", "eanNo": "string", "description": "string", "quantity": "number", "baseCost": "number", "igstPercent": "string", "igstValue": "number", "cgstPercent": "string", "cgstValue": "number", "sgstPercent": "string", "sgstValue": "number", "totalBaseValue": "number" } ] }`,
    grn_prompt: `
    You are an expert GST-GRN parser.
Read the attached GRN (image or PDF) and return STRICTLY valid, minified JSON that matches the schema supplied by the user.
Rules
- Do NOT add or remove keys.  
- Use null for any field you cannot find.  
- Return numbers as raw decimals (no commas, no ₹ symbol).  
- Output the JSON object only – no markdown, no prose.  
- Never invent or guess amounts, dates, or codes.  
FIELD HINTS (do not echo)
grnNumber    : "GOODS RECEIPT NOTE No." (e.g. 5000889643)  
grnDate      : date printed on the same line as GRN No. in dd-mm-yyyy format
buyerName    : Company name in block headed "Consignee" (Ex: Reliance Brands Limited)
sellerName   : Company name in block headed "Supplier"
vendorInvoiceNo : Vendor Invoice No. or Invoice reference from supplier
grnQty       : "Total Qty UOM wise … Accepted Qty" grand total  
poNumber     : "PO Number :" in header
items[].articleNo   : first numeric code in Article column  
items[].description : description text
items[].ean: 12 or 13-digit EAN / barcode (null if absent)
items[].challanQty : quantity mentioned in challan or delivery note
items[].receivedQty : quantity actually received at warehouse
items[].acceptedQty : number under "Accepted Qty" column

    Extract all the information from this GRN and return as JSON with the following structure:
{
  "grnNumber": "string",
  "grnDate": "string",
  "buyerName": "string",
  "sellerName": "string",
  "vendorInvoiceNo": "string",
  "grnQty": "number",
  "poNumber": "string",
  "items": [
    {
      "articleNo": "string",
      "description": "string",
      "ean": "string",
      "challanQty": "number",
      "receivedQty": "number",
      "acceptedQty": "number"
    }
  ]
}`,
    paymentadvice_prompt: `
    You are an expert payment-advice parser. Read the attached payment-advice (image or PDF) and return STRICTLY valid, minified JSON that matches the schema supplied by the user.
RULES
- Do NOT add or remove keys.
- Use null for any field you cannot find.
- Return numbers as raw decimals (no commas, no "₹"; no negatives).  
- Output the JSON object only - no markdown, no prose.
- Never invent or guess amounts or dates.
- Produce exactly one items[ ] object per distinct invoiceNumber.
INSTRUCTIONS (do not echo)
- Header field hints  
 documentNumber   : "We have settled … by Doc.number 4200018619/2024" (text "Doc.number ####/YYYY")
buyerName      : block headed "Reliance Brands Limited" (issuer of advice)
 sellerName     : block headed "Company / A/c with us" (e.g. UBOARD MOBILITY LIMITED)
 totalAmountSettled : figure in sentence "We have settled … INR X.XX"
- Line-item Logic
		Create one-and-only-one items[ ] object for each distinct value in column Inv./Ref. Doc.No.
		invoiceNumber : column Inv./Ref. Doc.No.
		invoiceAmount : column Inv./Ref. Doc. Amt. (may be blank)
		paymentAmount : column Payment Amount — 
▸ if the next detail line is TDS Amount … keep this value in paymentAmount;
▸ if the next line is GST TAX HOLD or GST PAID, move this value to gstTaxHold or gstTaxPaid;
▸ if the next line is contains neither TDS nor GST TAX HOLD or GST PAID, keep this value in paymentAmount
remarks : any notes, comments, or additional information related to the payment item (may be blank)
- Process  
 1 Fill all header fields from the top section.  
 2 For each distinct invoiceNumber:
    - Treat the first line as main line and create one object for that Inv./Ref. Doc.No.
    - Scan all the following lines in the document to find all lines that share the same invoiceNumber and
    - create one object inside items[ ] combining those values
     (null if a component is missing).  
 3 Return ONLY the final JSON object.

    Extract all the information from this payment advice and return as JSON with the following structure:
{
  "documentNumber": "string",
  "buyerName": "string",
  "sellerName": "string",
  "totalAmountSettled": "number",
  "items": [
    {
      "invoiceNumber": "string",
      "invoiceAmount": "number",
      "paymentAmount": "number",
      "tds": "number",
      "gstTaxHold": "number",
      "gstTaxPaid": "number",
      "remarks": "string"
    }
  ]
}`,
  },
  {
    name: "ELZA",
    code: "ELZA",
    status: Status.ACTIVE,
    invoice_prompt: `
    You are an expert GST-invoice parser. Read the attached invoice (PDF or image) and return minified JSON that matches the schema.
RULES
* Keep the exact keys below; use null when a value is absent.  
* Numbers: raw decimals, no commas or ₹.
* One JSON object only—no prose, no markdown.  
* Do not infer GST rates; if a line-item rate is missing, set gstRate = null.
* If there is an IGST amount, then cgstAmount and sgstAmount must be null.
* If there are CGST and SGST amounts, then igstAmount must be null.
* gstAmount must be the sum of cgstAmount and sgstAmount, OR it must be equal to igstAmount.
FIELD HINTS (do not echo)
supplierName  = Seller block (KIWI Kisan Window is the buyer).  
invoiceNumber = "Invoice No." / "Bill No."  
supplierGSTNo = 15-char GSTIN near supplier address  
grossAmount  = "Taxable Value" total (pre-tax)
cgstAmount   = total CGST amount.
sgstAmount   = total SGST amount.
igstAmount   = total IGST amount.
gstAmount   = total GST (CGST+SGST or IGST)  
totalAmount  = grand total (gross + GST)
Line items  
 qtyUnit = Pcs, Nos, Kg, etc.  
 rate   = unit price before tax  
 gstRate = % shown in line; null if blank  
 totalAmount  = taxable line amount; if only a GST-inclusive amount is printed, convert with totalAmount = inclusive/(1+gstRate/100)
SCHEMA
{
 "supplierName": "",
 "invoiceNumber": "",
 "invoiceDate": "DD-MM-YYYY",
 "supplierGSTNo": "",
 "grossAmount": 0.0,
 "cgstAmount": 0.0,
 "sgstAmount": 0.0,
 "igstAmount": 0.0,
 "gstAmount": 0.0,
 "totalAmount": 0.0,
 "items": [
  {
   "itemName": "",
   "hsn": "",
   "quantity": 0,
   "qtyUnit": "",
   "rate": 0.0,
   "gstRate": null,
   "totalAmount": 0.0
  }
 ]
}`,
    purchaseorder_prompt: `Extract all the information from this Purchase Order and return as JSON with the following structure:
{
  "poNumber": "string",
  "poDate": "string",
  "buyerName": "string",
  "sellerName": "string",
  "deliveryDate": "string",
  "site": "string",
  "totalBasicValue": "number",
  "totalIGST": "number",
  "totalOrderValue": "number",
  "totalQty": "number",
  "items": [
    {
      "articleNo": "string",
      "hsn": "string",
      "eanNo": "string",
      "description": "string",
      "quantity": "number",
      "baseCost": "number",
      "igstPercent": "string",
      "igstValue": "number",
      "totalBaseValue": "number"
    }
  ]
}`,
    grn_prompt: `Extract all the information from this GRN and return as JSON with the following structure:
{
  "grnNumber": "string",
  "grnDate": "string",
  "buyerName": "string",
  "sellerName": "string",
  "vendorInvoiceNo": "string",
  "grnQty": "number",
  "poNumber": "string",
  "items": [
    {
      "articleNo": "string",
      "description": "string",
      "challanQty": "number",
      "receivedQty": "number",
      "acceptedQty": "number"
    }
  ]
}`,
    paymentadvice_prompt: `Extract all the information from this payment advice and return as JSON with the following structure:
{
  "documentNumber": "string",
  "buyerName": "string",
  "sellerName": "string",
  "totalAmountSettled": "number",
  "items": [
    {
      "invoiceNumber": "string",
      "invoiceAmount": "number",
      "paymentAmount": "number",
      "tds": "number",
      "gstTaxHold": "number",
      "gstTaxPaid": "number"
    }
  ]
}`,
  },
  {
    name: "KIWI",
    code: "KIWI",
    status: Status.ACTIVE,
    invoice_prompt: `
    You are an expert GST-invoice parser. Read the attached invoice (PDF or image) and return minified JSON that matches the schema.
RULES
* Keep the exact keys below; use null when a value is absent.  
* Numbers: raw decimals, no commas or ₹.  
* One JSON object only—no prose, no markdown.  
* Do not infer GST rates; if a line-item rate is missing, set gstRate = null.
* If there is an IGST amount, then cgstAmount and sgstAmount must be null.
* If there are CGST and SGST amounts, then igstAmount must be null.
* gstAmount must be the sum of cgstAmount and sgstAmount, OR it must be equal to igstAmount.
FIELD HINTS (do not echo)
supplierName  = Seller block (KIWI Kisan Window is the buyer).  
invoiceNumber = "Invoice No." / "Bill No."  
supplierGSTNo = 15-char GSTIN near supplier address  
grossAmount  = "Taxable Value" total (pre-tax)
cgstAmount   = total CGST amount.
sgstAmount   = total SGST amount.
igstAmount   = total IGST amount.
gstAmount   = total GST (CGST+SGST or IGST)  
totalAmount  = grand total (gross + GST)
Line items  
 qtyUnit = Pcs, Nos, Kg, etc.  
 rate   = unit price before tax  
 gstRate = % shown in line; null if blank  
 amount  = taxable line amount; if only a GST-inclusive amount is printed, convert with amount = inclusive/(1+gstRate/100)
SCHEMA
{
 "supplierName": "",
 "invoiceNumber": "",
 "invoiceDate": "DD-MM-YYYY",
 "supplierGSTNo": "",
 "grossAmount": 0.0,
 "cgstAmount": 0.0,
 "sgstAmount": 0.0,
 "igstAmount": 0.0,
 "gstAmount": 0.0,
 "totalAmount": 0.0,
 "items": [
  {
   "itemName": "",
   "hsn": "",
   "quantity": 0,
   "qtyUnit": "",
   "rate": 0.0,
   "gstRate": null,
   "totalAmount": 0.0
  }
 ]
}
`,
    purchaseorder_prompt: `Extract all the information from this Purchase Order and return as JSON with the following structure:
{
  "poNumber": "string",
  "poDate": "string",
  "buyerName": "string",
  "sellerName": "string",
  "deliveryDate": "string",
  "site": "string",
  "totalBasicValue": "number",
  "totalIGST": "number",
  "totalOrderValue": "number",
  "totalQty": "number",
  "items": [
    {
      "articleNo": "string",
      "hsn": "string",
      "eanNo": "string",
      "description": "string",
      "quantity": "number",
      "baseCost": "number",
      "igstPercent": "string",
      "igstValue": "number",
      "totalBaseValue": "number"
    }
  ]
}`,
    grn_prompt: `Extract all the information from this GRN and return as JSON with the following structure:
{
  "grnNumber": "string",
  "grnDate": "string",
  "buyerName": "string",
  "sellerName": "string",
  "vendorInvoiceNo": "string",
  "grnQty": "number",
  "poNumber": "string",
  "items": [
    {
      "articleNo": "string",
      "description": "string",
      "challanQty": "number",
      "receivedQty": "number",
      "acceptedQty": "number"
    }
  ]
}`,
    paymentadvice_prompt: `Extract all the information from this payment advice and return as JSON with the following structure:
{
  "documentNumber": "string",
  "buyerName": "string",
  "sellerName": "string",
  "totalAmountSettled": "number",
  "items": [
    {
      "invoiceNumber": "string",
      "invoiceAmount": "number",
      "paymentAmount": "number",
      "tds": "number",
      "gstTaxHold": "number",
      "gstTaxPaid": "number"
    }
  ]
}

CRITICAL EXTRACTION RULES - READ ACTUAL VALUES FROM DOCUMENT:

1. DOCUMENT NUMBER: Look for and READ the exact payment advice document number
   - Usually labeled as "Payment Advice No.", "Doc No.", "Reference No."

2. TOTAL AMOUNT SETTLED: Look for and READ the exact total settlement amount
   - Often appears at the top or summary section
   - May be in words and numbers

3. INVOICE DETAILS: For each invoice entry, extract:
   - Invoice Number: Exact invoice reference number
   - Invoice Amount: Original invoice amount
   - Payment Amount: Actual amount paid for this invoice
   - TDS: Tax deducted at source (if any)
   - GST Tax Hold: GST amount on hold (if any)  
   - GST Tax Paid: GST amount paid (if any)

4. BUYER/SELLER NAMES: Read complete company names
   - Buyer: The company receiving the payment advice
   - Seller: The company issuing the payment advice

EXTRACTION PRIORITY:
- Always prioritize READING actual printed values
- Look for payment summary tables and invoice-wise breakdowns
- If a field is not present, mark as null
- Pay attention to negative values for deductions
- Scan the entire document for all referenced invoices

STRICT RULE: Never perform calculations. Only extract values explicitly shown in the document.`,
  },
];

const createOrganizations = async () => {
  try {
    await connectDB();
    logger.info("Connected to MongoDB successfully");

    const schemaFields = Object.keys(Organization.schema.paths);
    if (!schemaFields.includes("purchaseorder_prompt")) {
      logger.error("purchaseorder_prompt field is missing from the schema");
      process.exit(1);
    }
    if (!schemaFields.includes("paymentadvice_prompt")) {
      logger.error("paymentadvice_prompt field is missing from the schema");
      process.exit(1);
    }

    const deleteResult = await Organization.deleteMany({});
    logger.info(`Cleared ${deleteResult.deletedCount} existing organizations`);

    const createdOrganizations = [];

    for (const orgData of organizations) {
      try {
        const createdOrg = await Organization.create(orgData);
        createdOrganizations.push(createdOrg);
        logger.info(`Created organization: ${createdOrg.name}`);
      } catch (error) {
        logger.error(
          `Failed to create organization ${orgData.name}:`,
          error.message
        );
      }
    }

    const allSavedOrgs = await Organization.find({}).sort({ name: 1 });

    allSavedOrgs.forEach((org) => {
      const hasInvoicePrompt =
        org.invoice_prompt && org.invoice_prompt.length > 0;
      const hasPOPrompt =
        org.purchaseorder_prompt && org.purchaseorder_prompt.length > 0;
      const hasGRNPrompt = org.grn_prompt && org.grn_prompt.length > 0;
      const hasPaymentAdvicePrompt =
        org.paymentadvice_prompt && org.paymentadvice_prompt.length > 0;

      logger.info(
        `${org.name}: Invoice prompt ${
          hasInvoicePrompt ? "saved" : "missing"
        }, PO prompt ${hasPOPrompt ? "saved" : "missing"}, GRN prompt ${
          hasGRNPrompt ? "saved" : "missing"
        }, Payment Advice prompt ${
          hasPaymentAdvicePrompt ? "saved" : "missing"
        }`
      );
    });

    logger.info(
      `Successfully created ${createdOrganizations.length} out of ${organizations.length} organizations`
    );
    process.exit(0);
  } catch (error) {
    logger.error("Fatal error:", error);
    process.exit(1);
  }
};

if (!connectDB || !Organization) {
  logger.error("Failed to load required modules. Run 'npm run build' first.");
  process.exit(1);
}

createOrganizations();
