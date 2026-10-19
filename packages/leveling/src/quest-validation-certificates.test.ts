import { describe, expect, it } from "vitest";
import {
  createQuestValidationCertificateResolver,
  questValidationCertificate,
  questValidationCoverageSchema,
} from "./quest-validation-certificates.js";
import type {
  QuestValidationContext,
  QuestValidationResolution,
} from "./quest-validation-coverage.js";
import type { CampaignEvidenceIssue } from "./campaign-evidence.js";

const context: QuestValidationContext = {
  release: "guide-test",
  raceId: "human",
  classSlug: "priest",
  partySize: 5,
  objectiveIndexes: [1],
  targetNpcIds: [448],
  minimumLevelClaims: [9, 10],
  prerequisiteGate: { kind: "quest", questId: 152, state: "rewarded" },
};
const issue: CampaignEvidenceIssue = {
  code: "personal-eligibility-unverified",
  questId: 153,
  actionId: "accept",
  message: "Need evidence",
  domain: "eligibility",
  resolution: "in-game",
  blocksForecast: false,
};
const resolution: QuestValidationResolution = {
  runtimeBuild: 70450,
  compilerRevision: "compiler-test",
  code: "personal-eligibility-unverified",
  questId: 153,
  raceId: "human",
  classSlug: "priest",
  context,
  sourceSha256s: ["a".repeat(64)],
  sessionIds: ["private-session"],
  observationCount: 1,
};

function coverage(): ReturnType<typeof questValidationCoverageSchema.parse> {
  return questValidationCoverageSchema.parse({
    schema: "campaign-quest-validation-coverage.v1",
    runtimeBuild: 70450,
    compilerRevision: "compiler-test",
    certificates: [questValidationCertificate(resolution)],
  });
}

describe("privacy-safe quest validation certificates", () => {
  it("omits private session and character identities while retaining exact context binding", () => {
    const data = coverage();
    expect(JSON.stringify(data)).not.toContain("private-session");
    const resolve = createQuestValidationCertificateResolver(data, 70450, "compiler-test");
    expect(resolve(issue, context)).toMatchObject({ questId: 153, observationCount: 1 });
    expect(resolve(issue, context)?.sessionIds).toBeUndefined();
    for (const change of [
      { classSlug: "mage" },
      { raceId: "gnome" },
      { release: "other" },
      { objectiveIndexes: [2] },
      { targetNpcIds: [999] },
      { minimumLevelClaims: [10, 11] },
      { prerequisiteGate: null },
    ])
      expect(resolve(issue, { ...context, ...change })).toBeNull();
    expect(resolve({ ...issue, blocksForecast: true }, context)).toBeNull();
  });
  it("refuses foreign builds, obsolete compilers, duplicates and private raw data", () => {
    const data = coverage();
    expect(() => createQuestValidationCertificateResolver(data, 70451, "compiler-test")).toThrow(
      /runtime build/,
    );
    expect(() => createQuestValidationCertificateResolver(data, 70450, "new-compiler")).toThrow(
      /compiler/,
    );
    expect(() =>
      questValidationCoverageSchema.parse({
        ...data,
        certificates: [...data.certificates, ...data.certificates],
      }),
    ).toThrow(/unique/);
    expect(() =>
      questValidationCoverageSchema.parse({ ...data, observations: [{ character: "private" }] }),
    ).toThrow();
  });
});
