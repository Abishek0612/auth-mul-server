import { ErrorRequestHandler } from "express";
import { ApiError } from "../utils/api-errors";
import logger from "../config/logger";
import ErrorLogService from "../services/errorLog.service";
import { AuthRequest } from "../interface/request.interface";

const errorMiddleware: ErrorRequestHandler = async (err, req, res, next) => {
  console.log("Error middleware called:", err.message);

  const statusCode = err.statusCode || 500;
  const isOperationalError = err instanceof ApiError && err.isOperational;
  const authReq = req as AuthRequest;

  try {
    const errorDetails = {
      errorName: err.name,
      errorCode: err.code,
      errorMessage: err.message,
      statusCode: statusCode,
      isOperationalError: isOperationalError,
      stack: err.stack,
    };

    let errorCategory = "UnknownError";
    let operation = "unknown";

    if (req.originalUrl.includes("/auth/login")) {
      errorCategory = "AuthenticationError";
      operation = "user_login";
    } else if (req.originalUrl.includes("/auth/")) {
      errorCategory = "AuthorizationError";
      operation = "auth_operation";
    } else if (req.originalUrl.includes("/documents/upload")) {
      errorCategory = "DocumentUploadError";
      operation = "document_upload";
    } else if (req.originalUrl.includes("/documents/")) {
      errorCategory = "DocumentError";
      operation = "document_operation";
    } else if (req.originalUrl.includes("/users/")) {
      errorCategory = "UserError";
      operation = "user_operation";
    }

    const contextData: any = {
      url: req.originalUrl || req.url,
      method: req.method,
      body: req.method !== "GET" ? req.body : undefined,
      params: Object.keys(req.params).length > 0 ? req.params : undefined,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      headers: {
        userAgent: req.get("User-Agent"),
        referer: req.get("Referer"),
        origin: req.get("Origin"),
        contentType: req.get("Content-Type"),
        authorization: req.get("Authorization")
          ? "Bearer [REDACTED]"
          : undefined,
      },
      clientInfo: {
        ip: req.ip || req.connection.remoteAddress,
        timestamp: new Date().toISOString(),
      },
      errorDetails,
      errorCategory,
      operation,
    };

    if (authReq.user) {
      contextData["user"] = {
        userId: authReq.user._id,
        email: authReq.user.email,
        role: authReq.user.role,
        organizationId:
          typeof authReq.user.organization === "string"
            ? authReq.user.organization
            : authReq.user.organization?._id,
      };
    }

    await ErrorLogService.logError({
      message: err.message,
      stack: err.stack,
      level: statusCode >= 500 ? "error" : "warn",
      statusCode: statusCode,
      req: authReq,
      service: "ErrorMiddleware",
      operation: operation,
      additionalData: contextData,
    });
  } catch (logError) {
    console.error("Failed to log error:", logError);
  }

  if (
    err.message &&
    (err.message.includes("Invalid ObjectId") ||
      err.message.includes("input must be a 24 character hex string") ||
      err.message.includes("Cast to ObjectId failed"))
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid ID format provided",
    });
    return;
  }

  if (err.name === "ValidationError") {
    const validationErrors = Object.values(err.errors).map(
      (error: any) => error.message
    );
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validationErrors,
    });
    return;
  }

  if (err.name === "CastError") {
    res.status(400).json({
      success: false,
      message: "Invalid data format",
    });
    return;
  }

  if (err.code === 11000) {
    res.status(400).json({
      success: false,
      message: "Duplicate entry found",
    });
    return;
  }

  if (err instanceof ApiError) {
    const { statusCode, message, isOperational } = err;

    if (isOperational) {
      res.status(statusCode).json({
        success: false,
        message,
      });
      return;
    }

    logger.error("Unexpected error:", err);
  } else {
    logger.error("Unexpected error:", err);
  }

  res.status(500).json({
    success: false,
    message: "Something went wrong",
  });
};

export default errorMiddleware;
