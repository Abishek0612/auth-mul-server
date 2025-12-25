import { Response } from "express";
import { AuthRequest } from "../interface/request.interface";
import workspaceService from "../services/workspace.service";
import { catchAsync } from "../utils/catchAsync";

export class WorkspaceController {
  static getPOWorkspace = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      let organizationId: string;

      if (typeof req.user.organization === "string") {
        organizationId = req.user.organization;
      } else if (
        req.user.organization &&
        typeof req.user.organization === "object"
      ) {
        organizationId = req.user.organization._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Organization not found",
        });
      }

      const filters = {
        dateRange: req.query.dateRange
          ? JSON.parse(req.query.dateRange as string)
          : undefined,
        dateType: (req.query.dateType as any) || "poDate",
        site: req.query.site ? JSON.parse(req.query.site as string) : undefined,
        city: req.query.city ? JSON.parse(req.query.city as string) : undefined,
        article: req.query.article as string,
        search: req.query.search as string,
        invoiceStatus: req.query.invoiceStatus
          ? JSON.parse(req.query.invoiceStatus as string)
          : undefined,
        grnStatus: req.query.grnStatus
          ? JSON.parse(req.query.grnStatus as string)
          : undefined,
        buyer: req.query.buyer
          ? JSON.parse(req.query.buyer as string)
          : undefined,
        seller: req.query.seller
          ? JSON.parse(req.query.seller as string)
          : undefined,
      };

      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 100,
      };

      const result = await workspaceService.getPOWorkspace(
        organizationId,
        filters,
        pagination
      );

      res.status(200).json({
        success: true,
        data: result.documents,
        summary: result.summary,
        totals: result.totals,
        pagination: result.pagination,
      });
    }
  );

  static getInvoiceWorkspace = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      let organizationId: string;

      if (typeof req.user.organization === "string") {
        organizationId = req.user.organization;
      } else if (
        req.user.organization &&
        typeof req.user.organization === "object"
      ) {
        organizationId = req.user.organization._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Organization not found",
        });
      }

      const filters = {
        dateRange: req.query.dateRange
          ? JSON.parse(req.query.dateRange as string)
          : undefined,
        dateType: (req.query.dateType as any) || "invoiceDate",
        site: req.query.site ? JSON.parse(req.query.site as string) : undefined,
        city: req.query.city ? JSON.parse(req.query.city as string) : undefined,
        search: req.query.search as string,
        poStatus: req.query.poStatus
          ? JSON.parse(req.query.poStatus as string)
          : undefined,
        grnStatus: req.query.grnStatus
          ? JSON.parse(req.query.grnStatus as string)
          : undefined,
        buyer: req.query.buyer
          ? JSON.parse(req.query.buyer as string)
          : undefined,
        seller: req.query.seller
          ? JSON.parse(req.query.seller as string)
          : undefined,
      };

      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 100,
      };

      const result = await workspaceService.getInvoiceWorkspace(
        organizationId,
        filters,
        pagination
      );

      res.status(200).json({
        success: true,
        data: result.documents,
        summary: result.summary,
        totals: result.totals,
        pagination: result.pagination,
      });
    }
  );

  static getGRNWorkspace = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      let organizationId: string;

      if (typeof req.user.organization === "string") {
        organizationId = req.user.organization;
      } else if (
        req.user.organization &&
        typeof req.user.organization === "object"
      ) {
        organizationId = req.user.organization._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Organization not found",
        });
      }

      const filters = {
        dateRange: req.query.dateRange
          ? JSON.parse(req.query.dateRange as string)
          : undefined,
        dateType: (req.query.dateType as any) || "grnDate",
        site: req.query.site ? JSON.parse(req.query.site as string) : undefined,
        city: req.query.city ? JSON.parse(req.query.city as string) : undefined,
        search: req.query.search as string,
        invoiceStatus: req.query.invoiceStatus
          ? JSON.parse(req.query.invoiceStatus as string)
          : undefined,
        acceptanceStatus: req.query.acceptanceStatus
          ? JSON.parse(req.query.acceptanceStatus as string)
          : undefined,
        buyer: req.query.buyer
          ? JSON.parse(req.query.buyer as string)
          : undefined,
        seller: req.query.seller
          ? JSON.parse(req.query.seller as string)
          : undefined,
      };

      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 100,
      };

      const result = await workspaceService.getGRNWorkspace(
        organizationId,
        filters,
        pagination
      );

      res.status(200).json({
        success: true,
        data: result.documents,
        summary: result.summary,
        totals: result.totals,
        pagination: result.pagination,
      });
    }
  );

  static getPODetails = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    let organizationId: string;
    if (typeof req.user.organization === "string") {
      organizationId = req.user.organization;
    } else if (
      req.user.organization &&
      typeof req.user.organization === "object"
    ) {
      organizationId = req.user.organization._id;
    } else {
      return res.status(400).json({
        success: false,
        message: "Organization not found",
      });
    }

    const { poId } = req.params;

    const result = await workspaceService.getPODetails(poId, organizationId);

    res.status(200).json({
      success: true,
      data: result,
    });
  });

  static getInvoiceDetails = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      let organizationId: string;
      if (typeof req.user.organization === "string") {
        organizationId = req.user.organization;
      } else if (
        req.user.organization &&
        typeof req.user.organization === "object"
      ) {
        organizationId = req.user.organization._id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Organization not found",
        });
      }

      const { invoiceId } = req.params;
      const result = await workspaceService.getInvoiceDetails(
        invoiceId,
        organizationId
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    }
  );

  static getGRNDetails = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    let organizationId: string;
    if (typeof req.user.organization === "string") {
      organizationId = req.user.organization;
    } else if (
      req.user.organization &&
      typeof req.user.organization === "object"
    ) {
      organizationId = req.user.organization._id;
    } else {
      return res.status(400).json({
        success: false,
        message: "Organization not found",
      });
    }

    const { grnId } = req.params;
    const result = await workspaceService.getGRNDetails(grnId, organizationId);

    res.status(200).json({
      success: true,
      data: result,
    });
  });
}
