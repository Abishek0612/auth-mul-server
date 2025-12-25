import mongoose from "mongoose";
import { config } from "dotenv";
import Invoice from "../models/invoice.model";
import PurchaseOrder from "../models/purchaseorder.model";
import GRN from "../models/grn.model";
import PaymentAdvice from "../models/paymentadvice.model";

config();

function extractKeyFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname.startsWith("/")
      ? urlObj.pathname.substring(1)
      : urlObj.pathname;
    path = decodeURIComponent(path);
    return path;
  } catch (error) {
    console.error(
      `Error extracting key from URL "${url}":`,
      (error as any).message
    );
    throw error;
  }
}

async function migrateCollection(Model: any, collectionName: string) {
  console.log(`\n Migrating ${collectionName}...`);

  const documents = await Model.find({
    s3_url: { $exists: true },
    s3_key: { $exists: false },
  }).lean();

  console.log(
    `Found ${documents.length} documents to migrate in ${collectionName}`
  );

  let successCount = 0;
  let errorCount = 0;

  for (const doc of documents) {
    try {
      const s3Key = extractKeyFromUrl(doc.s3_url);

      await Model.updateOne(
        { _id: doc._id },
        {
          $set: { s3_key: s3Key },
          $unset: { s3_url: "" },
        }
      );

      successCount++;
      console.log(` Migrated ${doc._id}: ${doc.s3_url} → ${s3Key}`);
    } catch (error) {
      errorCount++;
      console.error(` Failed to migrate ${doc._id}:`, (error as any).message);
    }
  }

  console.log(`\n ${collectionName} Migration Complete:`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${errorCount}`);
}

async function migrate() {
  try {
    console.log(" Starting S3 URL to S3 Key Migration...\n");

    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/auth-system";
    await mongoose.connect(mongoUri);
    console.log(" Connected to MongoDB\n");

    await migrateCollection(Invoice, "Invoices");
    await migrateCollection(PurchaseOrder, "Purchase Orders");
    await migrateCollection(GRN, "GRNs");
    await migrateCollection(PaymentAdvice, "Payment Advice");

    console.log("\n Migration completed successfully!");
  } catch (error) {
    console.error("\n Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n Disconnected from MongoDB");
  }
}

migrate();
