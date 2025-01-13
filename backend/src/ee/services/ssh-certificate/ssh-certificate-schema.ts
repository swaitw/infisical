import { SshCertificatesSchema } from "@app/db/schemas";

export const sanitizedSshCertificate = SshCertificatesSchema.pick({
  id: true,
  sshCaId: true,
  sshCertificateTemplateId: true,
  serialNumber: true,
  certType: true,
  publicKey: true,
  principals: true,
  keyId: true,
  notBefore: true,
  notAfter: true
});
