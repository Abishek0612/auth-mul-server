import { config } from "dotenv";
config();

import app from "./app";
import connectDB from "./config/database";
import logger from "./config/logger";

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
