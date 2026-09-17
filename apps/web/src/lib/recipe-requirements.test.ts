import { describe, expect, it } from "vitest";

import { getAuditedRequiredSkillRank } from "./recipe-requirements.js";

describe("getAuditedRequiredSkillRank", () => {
  it("corrects the verified TBC Enchanted Leather requirement", () => {
    expect(getAuditedRequiredSkillRank("wow_anniversary", 69_795, 17_181, 1)).toBe(250);
  });

  it("does not leak a TBC override into another build", () => {
    expect(getAuditedRequiredSkillRank("wow_anniversary", 69_796, 17_181, 1)).toBe(1);
  });
});
