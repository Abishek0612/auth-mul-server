import { Response } from "express";
import { AuthRequest } from "../interface/request.interface";
import { catchAsync } from "../utils/catchAsync";
import workspaceService from "../services/workspace.service";
import { isValidObjectId, extractObjectIdString } from "../utils/objectIdUtils";

const getOrganizationId = (organization: any): string => {
  if (!organization) {
    return "";
  }

  if (typeof organization === "object" && organization._id) {
    return extractObjectIdString(organization._id);
  }

  return extractObjectIdString(organization);
};

export default class WorkspaceController {
  static getPOWorkspace = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const organizationId = getOrganizationId(req.user.organization);

      if (!isValidObjectId(organizationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }

      const filters = {
        dateRange: {
          from: req.query.fromDate as string,
          to: req.query.toDate as string,
        },
        site: req.query.site as string,
        city: req.query.city as string,
        buyer: req.query.buyer as string,
        seller: req.query.seller as string,
        status: req.query.status as string,
        search: req.query.search as string,
      };

      const result = await workspaceService.getPOWorkspaceData(
        organizationId,
        filters
      );

      res.status(200).json({
        success: true,
        data: result,
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

    const { poId } = req.params;

    if (!isValidObjectId(poId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PO ID",
      });
    }

    const result = await workspaceService.getPODetails(poId);

    res.status(200).json({
      success: true,
      data: result,
    });
  });

  static getInvoiceWorkspace = catchAsync(
    async (req: AuthRequest, res: Response) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const organizationId = getOrganizationId(req.user.organization);

      if (!isValidObjectId(organizationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }

      const filters = {
        dateRange: {
          from: req.query.fromDate as string,
          to: req.query.toDate as string,
        },
        buyer: req.query.buyer as string,
        seller: req.query.seller as string,
        search: req.query.search as string,
      };

      const result = await workspaceService.getInvoiceWorkspaceData(
        organizationId,
        filters
      );

      res.status(200).json({
        success: true,
        data: result,
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

      const organizationId = getOrganizationId(req.user.organization);

      if (!isValidObjectId(organizationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
      }

      const filters = {
        dateRange: {
          from: req.query.fromDate as string,
          to: req.query.toDate as string,
        },
        buyer: req.query.buyer as string,
        seller: req.query.seller as string,
        search: req.query.search as string,
      };

      const result = await workspaceService.getGRNWorkspaceData(
        organizationId,
        filters
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    }
  );
}
