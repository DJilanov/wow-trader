import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/forever-assets/[kind]/[key]/route";

const temporary: string[] = [];
afterEach(async (): Promise<void> => {
  vi.unstubAllEnvs();
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true })));
});
async function fixture(): Promise<{ root: string; releases: string; checksum: string }> {
  const root = await mkdtemp(join(tmpdir(), "talent-assets-route-"));
  temporary.push(root);
  const releases = join(root, "releases"),
    checksum = "a".repeat(64);
  await mkdir(join(releases, checksum, "icons"), { recursive: true });
  await writeFile(join(releases, checksum, "icons/class_mage.jpg"), "new assets");
  await mkdir(join(root, "legacy/icons"), { recursive: true });
  await writeFile(join(root, "legacy/icons/class_mage.jpg"), "legacy assets");
  vi.stubEnv("FOREVER_ASSET_RELEASES_ROOT", releases);
  vi.stubEnv("FOREVER_ASSET_ROOT", join(root, "legacy"));
  return { root, releases, checksum };
}
async function request(version: string, key = "class_mage"): Promise<Response> {
  return GET(new Request(`http://localhost/api/forever-assets/icon/${key}?v=${version}`), {
    params: Promise.resolve({ kind: "icon", key }),
  });
}
describe("Immutable talent assets", () => {
  it("serves new full hashes, old short URLs and legacy snapshots without changing their paths", async () => {
    const f = await fixture();
    expect(await (await request(f.checksum)).text()).toBe("new assets");
    expect(await (await request(f.checksum.slice(0, 12))).text()).toBe("new assets");
    expect(await (await request("b".repeat(64))).text()).toBe("legacy assets");
  });
  it("does not guess when a historical short checksum is ambiguous", async () => {
    const f = await fixture();
    await mkdir(join(f.releases, "a".repeat(12) + "b".repeat(52)));
    expect((await request("a".repeat(12))).status).toBe(409);
    expect((await request(f.checksum)).status).toBe(200);
  });
  it("rejects path traversal and links outside the release", async () => {
    const f = await fixture();
    expect((await request(f.checksum, "../secret")).status).toBe(404);
    await writeFile(join(f.root, "secret.jpg"), "private");
    await symlink(join(f.root, "secret.jpg"), join(f.releases, f.checksum, "icons/outside.jpg"));
    expect((await request(f.checksum, "outside")).status).toBe(404);
    expect((await request(f.checksum, "missing")).status).toBe(404);
  });
});
