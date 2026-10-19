import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIMULATOR_REVISION, SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest, serveSimulatorAsset } from "./forever-simulator";

async function fixture(
  bytes = Buffer.from("simulator test asset"),
): Promise<{ directory: string; release: string }> {
  const directory = await mkdtemp(join(tmpdir(), "forever-sim-assets-")),
    release = "a".repeat(24);
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
  it("keeps internal preset provenance private even when checksummed in a release manifest", async () => {
    const f = await fixture();
    try {
      const path = join(f.directory, f.release, "manifest.json");
      const manifest = JSON.parse(await readFile(path, "utf8")) as {
        files: Record<string, { bytes: number; sha256: string }>;
      };
      const bytes = Buffer.from("synthetic internal provenance fixture");
      manifest.files["kfc-reviewed-presets.json"] = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      await writeFile(path, JSON.stringify(manifest));
      await writeFile(join(f.directory, f.release, "kfc-reviewed-presets.json"), bytes);
      expect(
        (await readSimulatorManifest(f.directory, f.release))?.files["kfc-reviewed-presets.json"],
      ).toBeDefined();
      for (const method of ["GET", "HEAD"])
        expect(
          (
            await serveSimulatorAsset(
              new Request("http://localhost/internal", { method }),
              f.release,
              ["kfc-reviewed-presets.json"],
              f.directory,
            )
          ).status,
        ).toBe(404);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
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
  it("streams large files in bounded chunks and tolerates cancellation during disk reads", async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024, 42);
    const f = await fixture(bytes);
    try {
      await Promise.all(
        Array.from({ length: 32 }, async (_, index) => {
          const response = await serveSimulatorAsset(
            new Request("http://localhost/test"),
            f.release,
            ["lib.wasm"],
            f.directory,
          );
          const reader = response.body!.getReader();
          const pending = reader.read();
          if (index % 2) {
            const first = await pending;
            expect(first.value!.length).toBeLessThan(bytes.length);
          }
          await reader.cancel();
          await pending;
          expect((await reader.read()).done).toBe(true);
        }),
      );
      const complete = await serveSimulatorAsset(
        new Request("http://localhost/test"),
        f.release,
        ["lib.wasm"],
        f.directory,
      );
      expect(Buffer.from(await complete.arrayBuffer()).equals(bytes)).toBe(true);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
  it("closes aborted downloads before or during reading without poisoning later requests", async () => {
    const f = await fixture(Buffer.alloc(2 * 1024 * 1024));
    try {
      for (const abortBeforeResponse of [true, false]) {
        const controller = new AbortController();
        if (abortBeforeResponse) controller.abort();
        const response = await serveSimulatorAsset(
          new Request("http://localhost/test", { signal: controller.signal }),
          f.release,
          ["lib.wasm"],
          f.directory,
        );
        const reader = response.body!.getReader();
        if (!abortBeforeResponse) await reader.read();
        controller.abort();
        await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
      }
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
});
