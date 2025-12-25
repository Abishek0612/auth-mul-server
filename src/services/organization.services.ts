import Organization from "../models/organization.model";
import { OrganizationInput } from "../interface/organization.interface";
import { ConflictError, NotFoundError } from "../utils/api-errors";

export default class OrganizationService {
  /**
   * Create a new organization
   */
  static async createOrganization(input: OrganizationInput) {
    const { name, code } = input;

    const existingOrg = await Organization.findOne({ code });
    if (existingOrg) {
      throw new ConflictError(`Organization with code ${code} already exists`);
    }

    const organization = await Organization.create({
      name,
      code,
      status: input.status !== undefined ? input.status : true,
    });

    return organization;
  }

  /**
   * Get organization by ID
   */
  static async getOrganizationById(id: string) {
    const organization = await Organization.findById(id);
    if (!organization) {
      throw new NotFoundError("Organization not found");
    }
    return organization;
  }

  /**
   * Get organization by code
   */
  static async getOrganizationByCode(code: string) {
    const organization = await Organization.findOne({ code });
    if (!organization) {
      throw new NotFoundError(`Organization with code ${code} not found`);
    }
    return organization;
  }

  /**
   * Update organization status
   */
  static async updateOrganizationStatus(id: string, status: boolean) {
    const organization = await Organization.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    if (!organization) {
      throw new NotFoundError("Organization not found");
    }
    return organization;
  }

  static async getAllOrganizations() {
    return Organization.find({});
  }
}
