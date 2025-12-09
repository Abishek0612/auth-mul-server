import express, { Application, ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import mongoose from "mongoose";

import documentRoutes from "./routes/document.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import invoiceRoutes from "./routes/invoice.routes";
import errorMiddleware from "./middlewear/error.middlewear";

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet());
app.use(morgan("dev"));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

const allowedOrigins = [
  "http://localhost:5173",
  "http://13.200.42.44:5173",
  "http://13.200.42.44",
];

// CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    if (body && typeof body === "object") {
      body = JSON.parse(
        JSON.stringify(body, (key, value) => {
          if (value instanceof mongoose.Types.ObjectId) {
            return value.toString();
          }
          if (value instanceof Date) {
            return value.toISOString();
          }
          return value;
        })
      );
    }
    return originalJson.call(this, body);
  };
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/documents", documentRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP" });
});

// Error handling middleware (should be last)
app.use(errorMiddleware as ErrorRequestHandler);

export default app;
