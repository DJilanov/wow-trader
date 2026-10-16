import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIMULATOR_REVISION, SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest, serveSimulatorAsset } from "./forever-simulator";

async function fixture(): Promise<{ directory: string; release: string }> {
  const directory = await mkdtemp(join(tmpdir(), "forever-sim-assets-")),
    release = "a".repeat(24);
  const bytes = Buffer.from("simulator test asset");
  await mkdir(join(directory, release), { recursive: true });
  await writeFile(join(directory, release, "lib.wasm"), bytes);
  const manifest = {
    schema: "kfc-forever-simulator.v1",
    release,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: SIMULATOR_REVISION,
    preparedAt: "2026-10-16T00:00:00Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((spec) => spec.page),
    files: {
      "lib.wasm": { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
    },
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
  };
  await writeFile(join(directory, "active.json"), JSON.stringify(manifest));
  await writeFile(join(directory, release, "manifest.json"), JSON.stringify(manifest));
  return { directory, release };
}

describe("Self-hosted Forever simulator assets", () => {
  it("includes every launched class profile and raid, without advertising unimplemented healers", () => {
    expect(SIMULATOR_SPECS).toHaveLength(16);
    expect(
      new Set(SIMULATOR_SPECS.flatMap((spec) => (spec.className ? [spec.className] : []))).size,
    ).toBe(9);
    expect(SIMULATOR_SPECS.some((spec) => spec.role === "raid")).toBe(true);
  });
  it("serves versioned WASM with correct MIME, conditional caching and HEAD without a body", async () => {
    const f = await fixture();
    try {
      expect((await readSimulatorManifest(f.directory))?.revision).toBe(SIMULATOR_REVISION);
      const response = await serveSimulatorAsset(
        new Request("http://localhost/test"),
        f.release,
        ["lib.wasm"],
        f.directory,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/wasm");
      expect(await response.text()).toBe("simulator test asset");
      expect(response.headers.get("cache-control")).toContain("immutable");
      const cached = await serveSimulatorAsset(
        new Request("http://localhost/test", {
          headers: { "if-none-match": response.headers.get("etag")! },
        }),
        f.release,
        ["lib.wasm"],
        f.directory,
      );
      expect(cached.status).toBe(304);
      const head = await serveSimulatorAsset(
        new Request("http://localhost/test", { method: "HEAD" }),
        f.release,
        ["lib.wasm"],
        f.directory,
      );
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
  it("rejects traversal, unlisted files, unknown releases and symbolic links escaping a release", async () => {
    const f = await fixture();
    try {
      for (const path of [["..", "secret"], ["%2e%2e"], ["a/b"], [".env"], ["manifest.json"]])
        expect(
          (
            await serveSimulatorAsset(
              new Request("http://localhost/test"),
              f.release,
              path,
              f.directory,
            )
          ).status,
        ).toBe(404);
      expect(await readSimulatorManifest(f.directory, "invalid")).toBeNull();
      await rm(join(f.directory, f.release, "lib.wasm"));
      await writeFile(join(f.directory, "outside.wasm"), "simulator test asset");
      await symlink(join(f.directory, "outside.wasm"), join(f.directory, f.release, "lib.wasm"));
      expect(
        (
          await serveSimulatorAsset(
            new Request("http://localhost/test"),
            f.release,
            ["lib.wasm"],
            f.directory,
          )
        ).status,
      ).toBe(404);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
});
