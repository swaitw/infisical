import { ForbiddenError } from "@casl/ability";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { OrgServiceActor } from "@app/lib/types";
import { constructGroupOrgMembershipRoleMappings } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-fns";
import { TSyncExternalGroupOrgMembershipRoleMappingsDTO } from "@app/services/external-group-org-role-mapping/external-group-org-role-mapping-types";
import { TOrgRoleDALFactory } from "@app/services/org/org-role-dal";

import { TExternalGroupOrgRoleMappingDALFactory } from "./external-group-org-role-mapping-dal";

type TExternalGroupOrgRoleMappingServiceFactoryDep = {
  externalGroupOrgRoleMappingDAL: TExternalGroupOrgRoleMappingDALFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: TLicenseServiceFactory;
  orgRoleDAL: TOrgRoleDALFactory;
};

export type TExternalGroupOrgRoleMappingServiceFactory = ReturnType<typeof externalGroupOrgRoleMappingServiceFactory>;

export const externalGroupOrgRoleMappingServiceFactory = ({
  externalGroupOrgRoleMappingDAL,
  licenseService,
  permissionService,
  orgRoleDAL
}: TExternalGroupOrgRoleMappingServiceFactoryDep) => {
  const listExternalGroupOrgRoleMappings = async (actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    // TODO: will need to change if we add support for ldap, oidc, etc.
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);

    const mappings = await externalGroupOrgRoleMappingDAL.find({
      orgId: actor.orgId
    });

    return mappings;
  };

  const updateExternalGroupOrgRoleMappings = async (
    dto: TSyncExternalGroupOrgMembershipRoleMappingsDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    // TODO: will need to change if we add support for ldap, oidc, etc.
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);

    const mappings = await constructGroupOrgMembershipRoleMappings({
      mappingsDTO: dto.mappings,
      orgRoleDAL,
      licenseService,
      orgId: actor.orgId
    });

    const data = await externalGroupOrgRoleMappingDAL.updateExternalGroupOrgRoleMappingForOrg(actor.orgId, mappings);

    return data;
  };

  return {
    updateExternalGroupOrgRoleMappings,
    listExternalGroupOrgRoleMappings
  };
};
