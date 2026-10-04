import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCharacterProfile, WESTFALL_ROUTE } from "@wow-trader/leveling";
import { WESTFALL_CHAPTER_ID } from "./leveling-experience";
import type { LevelingFeedback } from "./leveling-feedback";

vi.mock("./database", () => ({ getDatabase: vi.fn() }));
vi.mock("./leveling-archive", () => ({ getImportedLevelingChapter: vi.fn() }));
import { getDatabase } from "./database";
import { getImportedLevelingChapter } from "./leveling-archive";
import {
  feedbackClientHash,
  storeLevelingFeedback,
  validateFeedbackPosition,
} from "./leveling-feedback-store";

const report: LevelingFeedback = {
  submissionId: "00000000-0000-4000-8000-000000000001",
  position: {
    chapterId: WESTFALL_CHAPTER_ID,
    version: WESTFALL_ROUTE.version,
    clientBuild: WESTFALL_ROUTE.clientBuild,
    stepId: WESTFALL_ROUTE.steps[0]!.id,
  },
  profile: createCharacterProfile(),
  category: "wrong-location",
  message: "The coordinates do not match the quest instructions.",
};
const stored = {
  id: "report-id",
  chapterId: report.position.chapterId,
  routeVersion: report.position.version,
  clientBuild: report.position.clientBuild,
  stepId: report.position.stepId,
  profile: report.profile,
  category: report.category,
  message: report.message,
};
function transactionStub(
  results: readonly unknown[][],
  inserted: readonly unknown[] = [{ id: "report-id" }],
) {
  let index = 0;
  const execute = vi.fn().mockResolvedValue(undefined);
  const select = vi.fn(() => ({
    from: () => ({
      where: () => {
        const rows = Promise.resolve(results[index++] ?? []);
        return Object.assign(rows, { limit: () => rows });
      },
    }),
  }));
  const values = vi.fn((_input: unknown) => ({
    onConflictDoNothing: () => ({ returning: () => Promise.resolve(inserted) }),
  }));
  const insert = vi.fn(() => ({ values }));
  const transaction = { execute, select, insert };
  vi.mocked(getDatabase).mockReturnValue({
    transaction: async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  } as unknown as ReturnType<typeof getDatabase>);
  return { execute, insert, values };
}
beforeEach(() => vi.resetAllMocks());
describe("feedback persistence and evidence validation", () => {
  it("locks the rate bucket, inserts minimal context and acknowledges the returned row only", async () => {
    const stub = transactionStub([[], [{ count: 0 }]]);
    expect(await storeLevelingFeedback(report, "daily-hash")).toEqual({
      kind: "created",
      id: "report-id",
    });
    expect(stub.execute).toHaveBeenCalledOnce();
    expect(stub.values).toHaveBeenCalledWith(
      expect.objectContaining({ clientHash: "daily-hash", submissionId: report.submissionId }),
    );
    expect(stub.values.mock.calls[0]?.[0]).not.toHaveProperty("name");
  });
  it("recognizes JSONB-key-reordered retries before applying the new-report rate limit", async () => {
    const stub = transactionStub([
      [{ ...stored, profile: Object.fromEntries(Object.entries(report.profile).reverse()) }],
    ]);
    expect(await storeLevelingFeedback(report, "daily-hash")).toEqual({
      kind: "duplicate",
      id: "report-id",
    });
    expect(stub.insert).not.toHaveBeenCalled();
  });
  it("rejects changed payloads and new reports over the limit without inserting", async () => {
    let stub = transactionStub([[{ ...stored, message: "Different report message" }]]);
    expect((await storeLevelingFeedback(report, "daily-hash")).kind).toBe("conflict");
    expect(stub.insert).not.toHaveBeenCalled();
    stub = transactionStub([[], [{ count: 5 }]]);
    expect((await storeLevelingFeedback(report, "daily-hash")).kind).toBe("limited");
    expect(stub.insert).not.toHaveBeenCalled();
  });
  it("resolves a unique-key race but never acknowledges an unconfirmed insert", async () => {
    transactionStub([[], [{ count: 0 }], [stored]], []);
    expect((await storeLevelingFeedback(report, "daily-hash")).kind).toBe("duplicate");
    transactionStub([[], [{ count: 0 }], []], []);
    await expect(storeLevelingFeedback(report, "daily-hash")).rejects.toThrow("not confirmed");
  });
  it("requires real chapter/step/release identities for the original edition", async () => {
    expect(await validateFeedbackPosition(report)).toBe(true);
    for (const position of [
      { ...report.position, chapterId: "unknown" },
      { ...report.position, stepId: "fake-step" },
      { ...report.position, clientBuild: 1 },
      { ...report.position, version: "99.0.0" },
    ])
      expect(await validateFeedbackPosition({ ...report, position })).toBe(false);
    expect(
      await validateFeedbackPosition({ ...report, profile: createCharacterProfile("horde") }),
    ).toBe(false);
    vi.mocked(getImportedLevelingChapter).mockResolvedValue(null);
    expect(
      await validateFeedbackPosition({
        ...report,
        position: { ...report.position, version: "import-v2-missing" },
      }),
    ).toBe(false);
  });
  it("hashes only the trusted proxy address and date, never the forwarded-for header", () => {
    vi.stubEnv("DATABASE_URL", "local-test-key-not-a-real-credential");
    try {
      const request = new Request("http://localhost", {
        headers: { "x-real-ip": "127.0.0.1", "x-forwarded-for": "untrusted" },
      });
      const date = new Date("2026-10-04T12:00:00Z");
      const hash = feedbackClientHash(request, date);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(
        feedbackClientHash(
          new Request("http://localhost", {
            headers: { "x-real-ip": "127.0.0.1", "x-forwarded-for": "changed" },
          }),
          date,
        ),
      ).toBe(hash);
      expect(feedbackClientHash(request, new Date("2026-10-05T12:00:00Z"))).not.toBe(hash);
      vi.stubEnv("DATABASE_URL", "");
      expect(() => feedbackClientHash(request, date)).toThrow("unavailable");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
