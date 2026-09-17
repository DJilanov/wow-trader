import { describe, expect, it } from "vitest";

import { rendererCommandSchema, utilityCommandSchema } from "./contracts.js";

describe("desktop IPC contracts", () => {
  it("accepts only known renderer actions with bounded identifiers", () => {
    expect(rendererCommandSchema.parse({ type: "check_now" })).toEqual({ type: "check_now" });
    expect(() => rendererCommandSchema.parse({ type: "delete_files" })).toThrow();
    expect(() =>
      rendererCommandSchema.parse({ type: "install_collector", productId: "x".repeat(65) }),
    ).toThrow();
  });

  it("does not allow a utility credential shorter than the API boundary", () => {
    expect(() =>
      utilityCommandSchema.parse({
        type: "configure",
        endpoint: "https://helper.kfcguild.online",
        statePath: "/tmp/state.json",
        products: [],
        automaticUploads: true,
        credential: "short",
      }),
    ).toThrow();
  });
});
