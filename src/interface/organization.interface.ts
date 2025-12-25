export enum Status {
  ACTIVE = "active",
  INACTIVE = "inactive",
  DELETE = "delete",
}

export interface IOrganization {
  name: string;
  code: string;
  status: Status;
  invoice_prompt?: string;
  purchaseorder_prompt?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrganizationInput {
  name: string;
  code: string;
  status?: Status;
  invoice_prompt?: string;
  purchaseorder_prompt?: string;
}
// node dist/scripts/organization-onboard.js
// node src/scripts/organization-onboard.js
