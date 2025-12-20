import express, { Application, ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import mongoose from "mongoose";

import documentRoutes from "./routes/document.routes";
import authRoutes from "./routes/auth.routes";
import workspaceRoutes from "./routes/workspace.routes";
import userRoutes from "./routes/user.routes";
import invoiceRoutes from "./routes/invoice.routes";
import errorMiddleware from "./middlewear/error.middlewear";

const app: Application = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://13.200.42.44:5173",
  "http://13.200.42.44",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
  })
);

app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(morgan("dev"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
  skip: (req) => {
    return req.method === "OPTIONS";
  },
});
app.use("/api/", limiter);

// ObjectId serialization middleware
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
app.use("/api/workspace", workspaceRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handling middleware
app.use(errorMiddleware as ErrorRequestHandler);

export default app;
