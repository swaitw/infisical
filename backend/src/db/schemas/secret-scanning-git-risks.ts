// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const SecretScanningGitRisksSchema = z.object({
  id: z.string().uuid(),
  description: z.string().nullable().optional(),
  startLine: z.string().nullable().optional(),
  endLine: z.string().nullable().optional(),
  startColumn: z.string().nullable().optional(),
  endColumn: z.string().nullable().optional(),
  file: z.string().nullable().optional(),
  symlinkFile: z.string().nullable().optional(),
  commit: z.string().nullable().optional(),
  entropy: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  tags: z.string().array().nullable().optional(),
  ruleID: z.string().nullable().optional(),
  fingerprint: z.string().nullable().optional(),
  fingerPrintWithoutCommitId: z.string().nullable().optional(),
  isFalsePositive: z.boolean().default(false).nullable().optional(),
  isResolved: z.boolean().default(false).nullable().optional(),
  riskOwner: z.string().nullable().optional(),
  installationId: z.string(),
  repositoryId: z.string().nullable().optional(),
  repositoryLink: z.string().nullable().optional(),
  repositoryFullName: z.string().nullable().optional(),
  pusherName: z.string().nullable().optional(),
  pusherEmail: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  orgId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TSecretScanningGitRisks = z.infer<typeof SecretScanningGitRisksSchema>;
export type TSecretScanningGitRisksInsert = Omit<z.input<typeof SecretScanningGitRisksSchema>, TImmutableDBKeys>;
export type TSecretScanningGitRisksUpdate = Partial<
  Omit<z.input<typeof SecretScanningGitRisksSchema>, TImmutableDBKeys>
>;
