import mongoose from "mongoose";
import logger from "./logger";

const connectDB = async (): Promise<void> => {
  try {
    const uri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/auth-system";

    await mongoose.connect(uri);

    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

export default connectDB;
