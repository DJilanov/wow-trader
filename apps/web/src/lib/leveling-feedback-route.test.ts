import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCharacterProfile, WESTFALL_ROUTE } from "@wow-trader/leveling";
import { WESTFALL_CHAPTER_ID } from "./leveling-experience";

vi.mock("./leveling-feedback-store", () => ({
  validateFeedbackPosition: vi.fn(),
  storeLevelingFeedback: vi.fn(),
  feedbackClientHash: vi.fn(),
}));
import { POST } from "../app/api/v1/leveling-feedback/route";
import {
  validateFeedbackPosition,
  storeLevelingFeedback,
  feedbackClientHash,
} from "./leveling-feedback-store";

const validate = vi.mocked(validateFeedbackPosition);
const store = vi.mocked(storeLevelingFeedback);
const hash = vi.mocked(feedbackClientHash);
const id = "00000000-0000-4000-8000-000000000001";
const report = {
  submissionId: id,
  position: {
    chapterId: WESTFALL_CHAPTER_ID,
    version: WESTFALL_ROUTE.version,
    clientBuild: WESTFALL_ROUTE.clientBuild,
    stepId: WESTFALL_ROUTE.steps[0]!.id,
  },
  profile: createCharacterProfile(),
  category: "wrong-location",
  message: "The map marker does not match the instructions.",
};
function request(body: unknown = report, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/v1/leveling-feedback", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  validate.mockResolvedValue(true);
  hash.mockReturnValue("hashed-daily-bucket");
  store.mockResolvedValue({ kind: "created", id });
});
describe("durable leveling feedback endpoint", () => {
  it("confirms a stored report without returning profile, message or IP", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ reportId: id, status: "received" });
    expect(store).toHaveBeenCalledWith(report, "hashed-daily-bucket");
  });
  it("rejects cross-site and missing-origin posts before touching storage", async () => {
    for (const headers of [
      { origin: "https://attacker.example" },
      { origin: "" },
      { "sec-fetch-site": "cross-site" },
    ])
      expect((await POST(request(report, headers))).status).toBe(403);
    expect(validate).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
  it("allows the configured HTTPS origin behind the loopback proxy", async () => {
    expect((await POST(request(report, { origin: "https://helper.kfcguild.online" }))).status).toBe(
      201,
    );
  });
  it("allows only known development loopback aliases on the matching port", async () => {
    expect((await POST(request(report, { origin: "http://127.0.0.1:3000" }))).status).toBe(201);
    expect((await POST(request(report, { origin: "http://127.0.0.1:4000" }))).status).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect((await POST(request(report, { origin: "http://127.0.0.1:3000" }))).status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("requires JSON and a strict, valid, minimal-context schema", async () => {
    expect((await POST(request(report, { "content-type": "text/plain" }))).status).toBe(415);
    for (const value of [
      { ...report, name: "private character" },
      { ...report, submissionId: "bad" },
      { ...report, message: "short" },
    ])
      expect((await POST(request(value))).status).toBe(400);
    expect(store).not.toHaveBeenCalled();
  });
  it("bounds actual streamed body bytes and accepts valid multi-byte messages", async () => {
    expect((await POST(request({ ...report, message: "a".repeat(9000) }))).status).toBe(413);
    expect(store).not.toHaveBeenCalled();
    expect((await POST(request({ ...report, message: "界".repeat(1500) }))).status).toBe(201);
    const malformed = new Request("http://localhost:3000/api/v1/leveling-feedback", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: "{bad",
    });
    expect((await POST(malformed)).status).toBe(400);
  });
  it("rejects stale or invented steps without saving them", async () => {
    validate.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(422);
    expect(store).not.toHaveBeenCalled();
  });
  it("makes identical retries idempotent and exposes conflicts and rate limits", async () => {
    store.mockResolvedValue({ kind: "duplicate", id });
    expect((await POST(request())).status).toBe(200);
    store.mockResolvedValue({ kind: "conflict", id: null });
    expect((await POST(request())).status).toBe(409);
    store.mockResolvedValue({ kind: "limited", id: null });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1800");
  });
  it("never acknowledges or leaks credentials when evidence or storage fails", async () => {
    for (const failure of [validate, store]) {
      failure.mockRejectedValueOnce(new Error("private database credentials"));
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "feedback_unavailable" });
    }
  });
});
