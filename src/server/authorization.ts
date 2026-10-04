import "server-only";

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type AuthorizationData = {
  findMembership(organizationId: string, userId: string): Promise<boolean>;
  findDealOrganizations(dealId: string): Promise<string[]>;
  findDocumentOrganizations(documentId: string): Promise<string[]>;
};

export function createAuthorizationGuards(database: AuthorizationData) {
  async function requireOrganizationMember(
    userId: string,
    organizationId: string,
  ) {
    if (!(await database.findMembership(organizationId, userId))) {
      throw new AuthorizationError();
    }
    return { organizationId, userId };
  }

  async function requireDealAccess(userId: string, dealId: string) {
    const organizationIds = await database.findDealOrganizations(dealId);
    if (!organizationIds.length)
      throw new AuthorizationError("Deal was not found.");
    for (const organizationId of organizationIds) {
      if (await database.findMembership(organizationId, userId))
        return { organizationId };
    }
    throw new AuthorizationError();
  }

  async function requireDocumentAccess(userId: string, documentId: string) {
    const organizationIds =
      await database.findDocumentOrganizations(documentId);
    if (!organizationIds.length)
      throw new AuthorizationError("Document was not found.");
    for (const organizationId of organizationIds) {
      if (await database.findMembership(organizationId, userId))
        return { organizationId };
    }
    throw new AuthorizationError();
  }

  return {
    requireOrganizationMember,
    requireDealAccess,
    requireDocumentAccess,
  };
}
