import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocalSimulatorReviews } from "../../../../lib/forever-simulator-local-reviews";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("local-review-not-found");
  }),
  read: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../../../lib/forever-simulator-local-reviews", () => ({
  readLocalSimulatorReviews: mocks.read,
}));

import LocalSimulatorReviewPage, { metadata } from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("returns not-found in production before reading any local evidence", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(LocalSimulatorReviewPage()).rejects.toThrow("local-review-not-found");
  expect(mocks.notFound).toHaveBeenCalledOnce();
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each([false, true])(
  "renders the explicit import/consent warning; provisional=%s",
  async (provisional: boolean) => {
    vi.stubEnv("NODE_ENV", "development");
    const listing: LocalSimulatorReviews = {
      status: "ready",
      identity: "a".repeat(64),
      release: "b".repeat(24),
      cases: [
        {
          id: "unit-test-case",
          spec: "warrior/arms",
          faction: "alliance",
          scenario: provisional ? "provisional-procs" : "conservative",
          stage: "calculations reviewed",
          status: "reviewed",
          href: "/forever-sim/test/warrior#unit-test-payload",
          referenceDps: 800,
          requiresProvisionalEnchantOptIn: provisional,
          warnings: [],
        },
      ],
    };
    mocks.read.mockResolvedValue(listing);
    const markup = renderToStaticMarkup(await LocalSimulatorReviewPage());
    expect(markup).toContain("Save your current simulator character first");
    expect(markup).toContain("Open reviewed build");
    expect(markup.includes("Provisional proc models stay OFF")).toBe(provisional);
    if (provisional) {
      expect(markup).toContain("Repeat after a reload");
      expect(markup).toContain("The build link never enables these models");
    }
    expect(metadata.robots).toEqual({ index: false, follow: false });
  },
);
