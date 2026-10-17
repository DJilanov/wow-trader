import { gameBuilds, itemDamages, itemStats, itemVersions } from "@wow-trader/db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./database", (): object => ({ getDatabase: vi.fn() }));
import { getDatabase } from "./database";
import { getReferenceClientItems } from "./data";

afterEach((): void => {
  vi.resetAllMocks();
});

describe("reference client item isolation", () => {
  it("groups stats and damage by exact item and scopes every query to the selected build and IDs", async () => {
    const checked: Array<{ table: unknown; params: unknown[] }> = [];
    const database = {
      select: (): object => ({
        from: (table: unknown): object => ({
          where: (condition: SQL): unknown => {
            checked.push({ table, params: new PgDialect().sqlToQuery(condition).params });
            if (table === gameBuilds)
              return {
                orderBy: (): object => ({
                  limit: async (): Promise<unknown[]> => [{ id: "selected-build" }],
                }),
              };
            if (table === itemVersions)
              return Promise.resolve([
                {
                  itemId: 117,
                  name: "Tough Jerky",
                  classId: 0,
                  subclassId: 5,
                  requiredLevel: 1,
                  delayMs: 0,
                },
                {
                  itemId: 25,
                  name: "Test Sword",
                  classId: 2,
                  subclassId: 7,
                  requiredLevel: 1,
                  delayMs: 2000,
                },
              ]);
            if (table === itemStats)
              return Promise.resolve([
                { buildId: "selected-build", itemId: 25, slot: 0, statType: 4, value: 5 },
              ]);
            if (table === itemDamages)
              return Promise.resolve([
                {
                  buildId: "selected-build",
                  itemId: 25,
                  slot: 0,
                  damageType: 0,
                  minimum: 1,
                  maximum: 3,
                },
              ]);
            throw new Error("Unexpected reference table");
          },
        }),
      }),
    };
    vi.mocked(getDatabase).mockReturnValue(database as unknown as ReturnType<typeof getDatabase>);
    const items = await getReferenceClientItems([117, 25], "wow_classic_beta");
    expect(items[0]?.stats).toEqual([]);
    expect(items[0]?.damages).toEqual([]);
    expect(items[1]?.stats).toHaveLength(1);
    expect(items[1]?.damages[0]?.maximum).toBe(3);
    expect(checked[0]?.params).toContain("wow_classic_beta");
    for (const query of checked.slice(1)) expect(query.params).toEqual(["selected-build", 117, 25]);
  });
});
