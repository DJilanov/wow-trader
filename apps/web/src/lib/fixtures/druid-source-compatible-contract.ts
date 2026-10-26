import { fullRaidDruidSourceCompatibility } from "../forever-simulator-full-raid-druid-schema-v3";

// Historical metadata is real; all final owner IDs, report pins and DPS in callers
// are explicit unit sentinels. This helper supplies no production admission.
const originalNumericalAuthority = {
  classSlug: "druid",
  authorizationReference: "call_8183aa9693344b5d83183075f2db2d03/0",
  startedAt: "2026-10-24T23:25:34.014Z",
  deadlineAt: "2026-10-25T23:25:34.014Z",
  originalLedger: {
    path: "artifacts/forever-simulator/optimization/first-pass-class-budgets/druid.json",
    byteSha256: "5cf032ae37e105349a6f95b66cb7b348eff695709f5f72814b9827faebc153d9",
  },
  phase: "correction",
  command: {
    classSlug: "druid",
    spec: "both-dps-styles",
    phase: "correction",
    script:
      "artifacts/forever-simulator/optimization/review-tools/run-druid-statistics-correction-v1.mjs",
    args: ["--run"],
  },
  commandSha256: fullRaidDruidSourceCompatibility.originalCommandSha256,
  commandSource: {
    path: "artifacts/forever-simulator/optimization/review-tools/run-druid-statistics-correction-v1.mjs",
    byteSha256: "8e8ef8381b240377fa0cee1c7fd746abd1c24dfac655a86ad57795ef23612f21",
  },
  sourceRelease: "57ac00a190de1da00d51b72d",
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected unit-contract object");
  return value as Record<string, unknown>;
}

/** Add compatible-execution metadata to an in-memory unit build only. */
export function setDruidCompatibleContractEvidence(
  build: Record<string, unknown>,
  runId: string,
  runSha256: string,
): void {
  const evidence = object(build.evidence),
    oldSupervisor = object(evidence.supervisor),
    supervisor = {
      ...oldSupervisor,
      runId,
      runSha256,
      commandSha256: fullRaidDruidSourceCompatibility.commandSha256,
      authorization: structuredClone(fullRaidDruidSourceCompatibility.authorization),
      preparation: structuredClone(fullRaidDruidSourceCompatibility.preparation),
      predecessorOriginalCommandSha256: fullRaidDruidSourceCompatibility.originalCommandSha256,
    };
  evidence.supervisor = supervisor;
  evidence.compatibleExecution = {
    authorization: structuredClone(fullRaidDruidSourceCompatibility.authorization),
    preparation: structuredClone(fullRaidDruidSourceCompatibility.preparation),
    supervisor: structuredClone(supervisor),
    originalNumericalAuthority: structuredClone(originalNumericalAuthority),
  };
  evidence.correction = {
    ...object(evidence.correction),
    path:
      "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/source-compatible-resume-v1/completed-" +
      runId +
      ".json",
  };
}
