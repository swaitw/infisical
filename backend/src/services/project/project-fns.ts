import crypto from "crypto";

import { ProjectVersion, TProjects } from "@app/db/schemas";
import { decryptAsymmetric, encryptAsymmetric } from "@app/lib/crypto";
import { NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { AddUserToWsDTO } from "./project-types";

export const assignWorkspaceKeysToMembers = ({ members, decryptKey, userPrivateKey }: AddUserToWsDTO) => {
  const plaintextProjectKey = decryptAsymmetric({
    ciphertext: decryptKey.encryptedKey,
    nonce: decryptKey.nonce,
    publicKey: decryptKey.sender.publicKey,
    privateKey: userPrivateKey
  });

  const newWsMembers = members.map(({ orgMembershipId, userPublicKey }) => {
    const { ciphertext: inviteeCipherText, nonce: inviteeNonce } = encryptAsymmetric(
      plaintextProjectKey,
      userPublicKey,
      userPrivateKey
    );

    return {
      orgMembershipId,
      workspaceEncryptedKey: inviteeCipherText,
      workspaceEncryptedNonce: inviteeNonce
    };
  });

  return newWsMembers;
};

type TCreateProjectKeyDTO = {
  publicKey: string;
  privateKey: string;
  plainProjectKey?: string;
};

export const createProjectKey = ({ publicKey, privateKey, plainProjectKey }: TCreateProjectKeyDTO) => {
  // 3. Create a random key that we'll use as the project key.
  const randomBytes = plainProjectKey || crypto.randomBytes(16).toString("hex");

  // 4. Encrypt the project key with the users key pair.
  const { ciphertext: encryptedProjectKey, nonce: encryptedProjectKeyIv } = encryptAsymmetric(
    randomBytes,
    publicKey,
    privateKey
  );

  return { key: encryptedProjectKey, iv: encryptedProjectKeyIv };
};

export const verifyProjectVersions = (projects: Pick<TProjects, "version">[], version: ProjectVersion) => {
  for (const project of projects) {
    if (project.version !== version) {
      return false;
    }
  }

  return true;
};

export const getProjectKmsCertificateKeyId = async ({
  projectId,
  projectDAL,
  kmsService
}: {
  projectId: string;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey">;
}) => {
  const keyId = await projectDAL.transaction(async (tx) => {
    const project = await projectDAL.findOne({ id: projectId }, tx);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }

    if (!project.kmsCertificateKeyId) {
      // create default kms key for certificate service
      const key = await kmsService.generateKmsKey({
        isReserved: true,
        orgId: project.orgId,
        tx
      });

      await projectDAL.updateById(
        projectId,
        {
          kmsCertificateKeyId: key.id
        },
        tx
      );

      return key.id;
    }

    return project.kmsCertificateKeyId;
  });

  return keyId;
};
