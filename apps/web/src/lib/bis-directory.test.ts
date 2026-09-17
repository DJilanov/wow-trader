import { describe, expect, it } from "vitest";

import { getTbcBisList, TBC_BIS_CLASSES } from "./bis-directory";

describe("TBC BiS directory", () => {
  it("provides one stable route for every class specialization and feral role", () => {
    const lists = TBC_BIS_CLASSES.flatMap(({ lists }) => lists);
    expect(TBC_BIS_CLASSES).toHaveLength(9);
    expect(lists).toHaveLength(28);
    expect(new Set(lists.map(({ slug }) => slug)).size).toBe(lists.length);
    expect(getTbcBisList("warrior-protection")).toMatchObject({
      classId: 1,
      specializationName: "Protection",
      role: "tank",
    });
    expect(getTbcBisList("druid-feral-damage")?.role).toBe("damage");
    expect(getTbcBisList("druid-feral-tank")?.role).toBe("tank");
  });

  it("rejects unknown routes instead of silently selecting another model", () => {
    expect(getTbcBisList("warrior-gladiator")).toBeNull();
  });
});
