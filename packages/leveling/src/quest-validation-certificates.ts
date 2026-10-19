import { z } from "zod";
import type { CampaignEvidenceIssue } from "./campaign-evidence.js";
import type { DungeonGate } from "./dungeon-model.js";
import { questValidationEvidenceCodeSchema } from "./quest-validation-evidence.js";
import type {
  QuestValidationContext,
  QuestValidationResolution,
} from "./quest-validation-coverage.js";

const certificateSchema = z
  .object({
    runtimeBuild: z.number().int().positive(),
    compilerRevision: z.string().min(1).max(100),
    questId: z.number().int().min(1).max(10_000_000),
    code: questValidationEvidenceCodeSchema,
    contextKey: z.string().min(1).max(16_000),
    sourceSha256s: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .min(1)
      .max(20),
    observationCount: z.number().int().min(1).max(4_000),
  })
  .strict();

export const questValidationCoverageSchema = z
  .object({
    schema: z.literal("campaign-quest-validation-coverage.v1"),
    runtimeBuild: z.number().int().positive(),
    compilerRevision: z.string().min(1).max(100),
    certificates: z.array(certificateSchema).max(20_000),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (
      coverage.certificates.some(
        (row) =>
          row.runtimeBuild !== coverage.runtimeBuild ||
          row.compilerRevision !== coverage.compilerRevision,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Certificate runtime build or compiler is inconsistent.",
      });
    const keys = coverage.certificates.map(
      (certificate) => `${certificate.code}:${certificate.questId}:${certificate.contextKey}`,
    );
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: "custom",
        message: "Quest validation certificates must be unique.",
      });
  });

export type QuestValidationCoverage = z.infer<typeof questValidationCoverageSchema>;
export type QuestValidationCertificate = z.infer<typeof certificateSchema>;

function gateKey(gate: DungeonGate | null): string {
  if (!gate) return "none";
  if (gate.kind === "quest") return `quest:${gate.questId}:${gate.state}`;
  if (gate.kind === "item") return `item:${gate.itemId}`;
  if (gate.kind === "confirmation") return `confirmation:${gate.id}`;
  return JSON.stringify([gate.kind, gate.gates.map(gateKey).sort()]);
}

export function questValidationContextKey(
  context: QuestValidationContext,
  code: CampaignEvidenceIssue["code"],
): string {
  const normalized = (value: string | null): string | null =>
    value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? null;
  const sorted = (values: readonly number[]): number[] =>
    [...new Set(values)].sort((a, b) => a - b);
  return JSON.stringify([
    context.release,
    normalized(context.raceId),
    normalized(context.classSlug),
    context.partySize,
    sorted(context.objectiveIndexes),
    sorted(context.targetNpcIds),
    sorted(context.minimumLevelClaims),
    gateKey(context.prerequisiteGate),
    code === "named-target-unverified"
      ? (context.partyMembers ?? [])
          .map((member) => `${normalized(member.raceId)}:${normalized(member.classSlug)}`)
          .sort()
      : null,
  ]);
}

export function questValidationCertificate(
  resolution: QuestValidationResolution,
): QuestValidationCertificate {
  return certificateSchema.parse({
    runtimeBuild: resolution.runtimeBuild,
    compilerRevision: resolution.compilerRevision,
    questId: resolution.questId,
    code: resolution.code,
    contextKey: questValidationContextKey(resolution.context, resolution.code),
    sourceSha256s: resolution.sourceSha256s,
    observationCount: resolution.observationCount,
  });
}

export function createQuestValidationCertificateResolver(
  input: QuestValidationCoverage,
  runtimeBuild: number,
  compilerRevision: string,
): (
  issue: CampaignEvidenceIssue,
  context: QuestValidationContext,
) => QuestValidationResolution | null {
  const coverage = questValidationCoverageSchema.parse(input);
  if (coverage.runtimeBuild !== runtimeBuild || coverage.compilerRevision !== compilerRevision)
    throw new Error("Quest validation coverage has a different runtime build or compiler.");
  const certificates = new Map(
    coverage.certificates.map((row) => [`${row.code}:${row.questId}:${row.contextKey}`, row]),
  );
  return (issue, context): QuestValidationResolution | null => {
    if (issue.questId === null || issue.blocksForecast || !context.raceId || !context.classSlug)
      return null;
    const certificate = certificates.get(
      `${issue.code}:${issue.questId}:${questValidationContextKey(context, issue.code)}`,
    );
    if (!certificate) return null;
    return {
      runtimeBuild,
      compilerRevision,
      code: certificate.code,
      questId: certificate.questId,
      sourceSha256s: certificate.sourceSha256s,
      observationCount: certificate.observationCount,
      raceId: context.raceId,
      classSlug: context.classSlug,
      context,
    };
  };
}
