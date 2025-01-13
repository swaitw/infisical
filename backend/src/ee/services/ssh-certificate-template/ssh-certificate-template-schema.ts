import { SshCertificateTemplatesSchema } from "@app/db/schemas";

export const sanitizedSshCertificateTemplate = SshCertificateTemplatesSchema.pick({
  id: true,
  sshCaId: true,
  status: true,
  name: true,
  ttl: true,
  maxTTL: true,
  allowedUsers: true,
  allowedHosts: true,
  allowCustomKeyIds: true,
  allowUserCertificates: true,
  allowHostCertificates: true
});
