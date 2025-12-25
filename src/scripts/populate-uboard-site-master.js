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

const uboardSiteMasterSchema = new mongoose.Schema(
  {
    siteCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    siteName: {
      type: String,
      required: true,
      trim: true,
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

const UboardSiteMaster = mongoose.model(
  "UboardSiteMaster",
  uboardSiteMasterSchema
);

const EXCEL_FILE_PATH = path.resolve(__dirname, "../../Site Master Sheet.xlsx");

const importSiteMaster = async () => {
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

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!rawData || rawData.length === 0) {
      console.error("No data found in Excel file");
      process.exit(1);
    }

    console.log(`Found ${rawData.length} rows in Excel file`);

    const existingCount = await UboardSiteMaster.countDocuments();
    if (existingCount > 0) {
      console.log(
        `Site master already contains ${existingCount} records. Clearing existing data...`
      );
      await UboardSiteMaster.deleteMany({});
    }

    let startRow = 0;
    if (rawData[0] && typeof rawData[0][0] === "string") {
      const firstCell = String(rawData[0][0]).toLowerCase();
      if (firstCell.includes("site") || firstCell.includes("code")) {
        startRow = 1;
        console.log("Detected header row, skipping first row");
      }
    }

    const siteData = [];

    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];

      if (!row || row.length === 0) {
        continue;
      }

      const siteCode = row[0] ? String(row[0]).trim() : null;
      const siteName = row[1] ? String(row[1]).trim() : siteCode || null;

      if (!siteCode) {
        console.warn(`Row ${i + 1}: Missing site code, skipping`);
        continue;
      }

      siteData.push({
        siteCode,
        siteName,
        active: true,
      });
    }

    console.log(`Processed ${siteData.length} valid records`);

    if (siteData.length === 0) {
      console.error("No valid records to import");
      process.exit(1);
    }

    const BATCH_SIZE = 100;
    let insertedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < siteData.length; i += BATCH_SIZE) {
      const batch = siteData.slice(i, i + BATCH_SIZE);

      try {
        const result = await UboardSiteMaster.insertMany(batch, {
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
    console.log(`  - Total processed: ${siteData.length}`);

    const totalCount = await UboardSiteMaster.countDocuments();
    console.log(`\nTotal sites in database: ${totalCount}`);

    process.exit(0);
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  }
};

importSiteMaster();
