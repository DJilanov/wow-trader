import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ADDON_COMPILER_REVISION } from "@wow-trader/leveling";
import {
  readLevelingQuestValidationCoverage,
  getLevelingQuestValidationCoverage,
} from "./leveling-quest-validation";

const roots: string[] = [];
afterEach(async (): Promise<void> => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function artifact(
  change: Record<string, unknown> = {},
): Promise<{ path: string; sha256: string }> {
  const root = await mkdtemp(join(tmpdir(), "leveling-quest-coverage-"));
  roots.push(root);
  const path = join(root, "coverage.json");
  const raw = `${JSON.stringify({ schema: "campaign-quest-validation-coverage.v1", runtimeBuild: 70450, compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION, certificates: [], ...change })}\n`;
  await writeFile(path, raw);
  return { path, sha256: createHash("sha256").update(raw).digest("hex") };
}

describe("published quest-validation reader", () => {
  it("leaves unconfigured validation explicitly absent", async () => {
    expect(await readLevelingQuestValidationCoverage(undefined, undefined, null)).toEqual({
      data: null,
      revision: "not-configured",
      notice: null,
    });
  });
  it("accepts only checksum-bound coverage for the active client and compiler", async () => {
    const file = await artifact();
    expect(
      (await readLevelingQuestValidationCoverage(file.path, file.sha256, 70450)).data?.runtimeBuild,
    ).toBe(70450);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (await readLevelingQuestValidationCoverage(file.path, "0".repeat(64), 70450)).data,
    ).toBeNull();
    expect(
      (await readLevelingQuestValidationCoverage(file.path, file.sha256, 70451)).data,
    ).toBeNull();
    expect(
      (await readLevelingQuestValidationCoverage(file.path, undefined, 70450)).data,
    ).toBeNull();
    const old = await artifact({ compilerRevision: "old-compiler" });
    expect(
      (await readLevelingQuestValidationCoverage(old.path, old.sha256, 70450)).data,
    ).toBeNull();
  });
  it("never loads private observations as public coverage or logs their contents", async () => {
    const file = await artifact({ observations: [{ character: { name: "Private Character" } }] });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await readLevelingQuestValidationCoverage(file.path, file.sha256, 70450);
    expect(result.data).toBeNull();
    expect(result.notice).toContain("remain unverified");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Private Character");
  });
  it("pins the reviewed runtime separately from a legacy source snapshot", async () => {
    const file = await artifact();
    vi.stubEnv("WOW_TRADER_LEVELING_QUEST_VALIDATION_COVERAGE", file.path);
    vi.stubEnv("WOW_TRADER_LEVELING_QUEST_VALIDATION_COVERAGE_SHA256", file.sha256);
    vi.stubEnv("WOW_TRADER_LEVELING_RUNTIME_BUILD", "70450");
    expect((await getLevelingQuestValidationCoverage(70205)).data?.runtimeBuild).toBe(70450);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("WOW_TRADER_LEVELING_RUNTIME_BUILD", "70451");
    expect((await getLevelingQuestValidationCoverage(70205)).data).toBeNull();
    vi.stubEnv("WOW_TRADER_LEVELING_RUNTIME_BUILD", "invalid");
    expect((await getLevelingQuestValidationCoverage(70205)).data).toBeNull();
  });
});
