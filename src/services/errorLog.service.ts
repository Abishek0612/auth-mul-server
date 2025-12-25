import ErrorLog from "../models/errorlog.model";
import { AuthRequest } from "../interface/request.interface";
import { v4 as uuidGenerate } from "uuid";

interface ErrorLogData {
  message: string;
  stack?: string;
  level?: "error" | "warn" | "fatal";
  statusCode?: number;
  additionalData?: any;
  req?: AuthRequest;
  service?: string;
  operation?: string;
  userId?: string;
  organizationId?: string;
}

interface ErrorLogDocument {
  timestamp: Date;
  level: "error" | "warn" | "fatal";
  message: string;
  stack?: string;
  statusCode?: number;
  additionalData: any;
  requestId: string;
  url?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
  userId?: string;
  organizationId?: string;
}

class ErrorLogService {
  static async logError(data: ErrorLogData): Promise<void> {
    try {
      const errorLog: ErrorLogDocument = {
        timestamp: new Date(),
        level: data.level || "error",
        message: data.message,
        stack: data.stack,
        statusCode: data.statusCode,
        additionalData: {
          ...data.additionalData,
          service: data.service,
          operation: data.operation,
          errorTimestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || "development",
        },
        requestId: uuidGenerate(),
      };

      if (data.req) {
        errorLog.url = data.req.originalUrl || data.req.url;
        errorLog.method = data.req.method;
        errorLog.userAgent = data.req.get("User-Agent");
        errorLog.ip = data.req.ip || data.req.connection.remoteAddress;

        if (data.req.user) {
          errorLog.userId = data.req.user._id;
          if (data.req.user.organization) {
            errorLog.organizationId =
              typeof data.req.user.organization === "string"
                ? data.req.user.organization
                : data.req.user.organization._id;
          }
        }
      }

      if (data.userId && !errorLog.userId) {
        errorLog.userId = data.userId;
      }

      if (data.organizationId && !errorLog.organizationId) {
        errorLog.organizationId = data.organizationId;
      }

      await ErrorLog.create(errorLog);
    } catch (dbError) {
      console.error("Failed to log error to database:", dbError);
      console.error("Original error that failed to log:", data.message);
    }
  }

  static async logServiceError(
    service: string,
    operation: string,
    error: any,
    additionalData?: any,
    userId?: string,
    organizationId?: string
  ): Promise<void> {
    try {
      await this.logError({
        message: error.message || "Unknown service error",
        stack: error.stack,
        level: "error",
        service,
        operation,
        userId,
        organizationId,
        additionalData: {
          ...additionalData,
          errorName: error.name,
          errorCode: error.code,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (logError) {
      console.error(`Failed to log ${service} error:`, logError);
    }
  }

  static async getErrorLogs(filter = {}, limit = 100, skip = 0) {
    return ErrorLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .populate("userId", "firstName lastName email")
      .populate("organizationId", "name code")
      .lean();
  }

  static async getErrorStats(timeRange = 24) {
    const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);

    return ErrorLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: "$level",
          count: { $sum: 1 },
          latestError: { $max: "$timestamp" },
        },
      },
    ]);
  }
}

export default ErrorLogService;
