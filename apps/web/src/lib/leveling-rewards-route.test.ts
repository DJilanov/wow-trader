import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemDetail } from "./data";
const { load } = vi.hoisted(() => ({ load: vi.fn<() => Promise<Partial<ItemDetail> | null>>() }));
vi.mock("./data", () => ({ getItemDetail: load }));
import { GET } from "../app/api/v1/leveling-rewards/[itemId]/route";

function request(id = "279894"): Promise<Response> {
  return GET(new Request(`http://localhost/api/v1/leveling-rewards/${id}`), {
    params: Promise.resolve({ itemId: id }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/test");
});
describe("same-build Forever reward preview", () => {
  it("rejects unlisted or malformed IDs before querying the database", async () => {
    for (const id of ["1", "-1", "279894x", "001", "999999999999"])
      expect((await request(id)).status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });
  it("handles catalog absence, errors and build mismatch without assumed values", async () => {
    load.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    load.mockRejectedValue(new Error("private database message"));
    const failed = await request();
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private");
    load.mockResolvedValue({ build: { number: 70206, version: "1.60.1" } });
    expect((await request()).status).toBe(409);
  });
  it("uses Forever, serializes copper safely and reuses stat formatting", async () => {
    load.mockResolvedValue({
      itemId: 279894,
      name: "Calibrated Blunderbuss",
      build: { number: 70205, version: "1.60.1" },
      requiredLevel: 14,
      inventoryType: 26,
      binding: 1,
      stats: [{ slot: 0, statType: 7, value: 2 }],
      damages: [],
      delayMs: 0,
      resistances: [],
      sellPriceCopper: 1234n,
      allowedClasses: [],
    });
    const response = await request();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { vendorCopper: number; stats: string[] };
    expect(body.vendorCopper).toBe(1234);
    expect(body.stats).toContain("+2 Stamina");
    expect(load).toHaveBeenCalledWith(279894, "wow_classic_beta");
  });
  it("does not query when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    expect((await request()).status).toBe(503);
    expect(load).not.toHaveBeenCalled();
  });
});
