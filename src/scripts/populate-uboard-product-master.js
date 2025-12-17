require("dotenv").config();
const XLSX = require("xlsx");
const mongoose = require("mongoose");
const path = require("path");

const connectDB = async () => {
  try {
    const uri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/auth-system";
    await mongoose.connect(uri);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const uboardProductMasterSchema = new mongoose.Schema(
  {
    articleCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    productCategory: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    hsnCode: {
      type: String,
      required: true,
      trim: true,
    },
    eanCode: {
      type: String,
      required: true,
      trim: true,
    },
    baseCost: {
      type: Number,
      required: true,
      min: 0,
    },
    gstPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const UboardProductMaster = mongoose.model(
  "UboardProductMaster",
  uboardProductMasterSchema
);

const EXCEL_FILE_PATH = path.resolve(
  __dirname,
  "../../Product Master Sheet.xlsx"
);

const importProductMaster = async () => {
  try {
    await connectDB();
    console.log("Connected to MongoDB successfully");

    const fs = require("fs");
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      console.error(`Excel file not found at: ${EXCEL_FILE_PATH}`);
      console.log("Please place your Excel file in the server root directory");
      process.exit(1);
    }

    console.log(`Reading Excel file: ${EXCEL_FILE_PATH}`);

    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    if (!rawData || rawData.length === 0) {
      console.error("No data found in Excel file");
      process.exit(1);
    }

    console.log(`Found ${rawData.length} rows in Excel file`);

    const existingCount = await UboardProductMaster.countDocuments();
    if (existingCount > 0) {
      console.log(
        `Product master already contains ${existingCount} records. Skipping import.`
      );
      process.exit(0);
    }

    const getColumnValue = (row, possibleNames) => {
      for (let name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null) {
          return String(row[name]).trim();
        }
      }
      return null;
    };

    const parseNumber = (value) => {
      if (!value) return 0;
      return parseFloat(String(value).replace(/,/g, ""));
    };

    const productData = rawData
      .map((row, index) => {
        try {
          const articleCode = getColumnValue(row, [
            "Article Code",
            "articleCode",
            "ARTICLE CODE",
            "Article_Code",
          ]);

          const productName = getColumnValue(row, [
            "PRODUCT NAME",
            "Product Name",
            "productName",
            "Product_Name",
          ]);

          const productCategory = getColumnValue(row, [
            "PRODUCT Category",
            "Product Category",
            "productCategory",
            "Category",
          ]);

          const brand = getColumnValue(row, ["Brand", "brand", "BRAND"]) || "";

          const hsnCode = getColumnValue(row, [
            "Hsn Code",
            "HSN Code",
            "hsnCode",
            "HSN",
            "HSN_Code",
          ]);

          const eanCode = getColumnValue(row, [
            "EAN Code",
            "eanCode",
            "EAN",
            "EANCODE",
            "EAN_Code",
          ]);

          const baseCostStr = getColumnValue(row, [
            "Base Cost",
            "baseCost",
            "BASE COST",
            "Base_Cost",
          ]);

          const gstStr = getColumnValue(row, [
            "Gst %",
            "GST %",
            "GST",
            "gstPercentage",
            "GST_Percentage",
          ]);

          if (
            !articleCode ||
            !productName ||
            !productCategory ||
            !hsnCode ||
            !eanCode ||
            !baseCostStr ||
            !gstStr
          ) {
            console.warn(`Row ${index + 2}: Missing required fields`);
            return null;
          }

          const baseCost = parseNumber(baseCostStr);
          const gstPercentage = parseNumber(gstStr.replace("%", ""));

          if (isNaN(baseCost) || isNaN(gstPercentage)) {
            console.warn(
              `Row ${
                index + 2
              }: Invalid number format - Base Cost: ${baseCostStr}, GST: ${gstStr}`
            );
            return null;
          }

          return {
            articleCode,
            productName,
            productCategory,
            brand,
            hsnCode,
            eanCode,
            baseCost,
            gstPercentage,
            active: true,
          };
        } catch (error) {
          console.error(`Error processing row ${index + 2}:`, error.message);
          return null;
        }
      })
      .filter((item) => item !== null);

    console.log(`Processed ${productData.length} valid records`);

    if (productData.length === 0) {
      console.error("No valid records to import");
      process.exit(1);
    }

    const BATCH_SIZE = 100;
    let insertedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < productData.length; i += BATCH_SIZE) {
      const batch = productData.slice(i, i + BATCH_SIZE);

      try {
        const result = await UboardProductMaster.insertMany(batch, {
          ordered: false,
        });
        insertedCount += result.length;
        console.log(
          `Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${
            result.length
          } records`
        );
      } catch (error) {
        if (error.name === "BulkWriteError") {
          const insertedInBatch = error.result.nInserted || 0;
          const duplicates = batch.length - insertedInBatch;
          insertedCount += insertedInBatch;
          skippedCount += duplicates;
          console.warn(
            `Batch ${
              Math.floor(i / BATCH_SIZE) + 1
            }: Inserted ${insertedInBatch}, Skipped ${duplicates} duplicates`
          );
        } else {
          console.error(`Error inserting batch:`, error.message);
          throw error;
        }
      }
    }

    console.log(`\nImport completed successfully!`);
    console.log(`Summary:`);
    console.log(`  - Inserted: ${insertedCount}`);
    console.log(`  - Skipped: ${skippedCount}`);
    console.log(`  - Total processed: ${productData.length}`);

    const totalCount = await UboardProductMaster.countDocuments();
    console.log(`\nTotal products in database: ${totalCount}`);

    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
};

importProductMaster();
