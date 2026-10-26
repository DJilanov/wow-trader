import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  paladinHealerReleaseSchema,
  type PaladinHealerRelease,
} from "@wow-trader/forever-data/paladin-healer-release";
import {
  paladinPayloadFixture,
  paladinIndexFixture as index,
  paladinGroupFixtures,
  paladinPresentationFixture as presentation,
} from "./fixtures/paladin-healer-contract";
import {
  isPaladinHealerAvailable,
  readPaladinHealerGroup,
  readPaladinHealerIndex,
  readPaladinHealerPresentation,
  readPaladinHealerRelease,
  servePaladinHealerAsset,
} from "./paladin-healer-simulator";

interface ReleaseFixture {
  readonly directory: string;
  readonly manifest: PaladinHealerRelease;
  readonly contents: ReadonlyMap<string, Buffer>;
}
const identity = (bytes: Buffer): { bytes: number; sha256: string } => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});
async function fixture(active = true): Promise<ReleaseFixture> {
  const directory = await mkdtemp(join(tmpdir(), "paladin-healer-assets-"));
  const release = "a".repeat(24);
  const contents = new Map(
    paladinPayloadFixture.assets.map((entry) => [
      entry.ref.file,
      Buffer.from(JSON.stringify(entry.payload) + "\n"),
    ]),
  );
  contents.set("presentation.json", Buffer.from(JSON.stringify(presentation)));
  for (const name of ["healing.wasm", "healing-worker.js", "request-codec.js", "wasm_exec.js"])
    contents.set(name, Buffer.from("asset transport test: " + name));
  const encodings: NonNullable<PaladinHealerRelease["encodings"]> = {};
  await mkdir(join(directory, release));
  for (const [name, body] of contents) {
    const br = brotliCompressSync(body),
      gzip = gzipSync(body);
    encodings[name] = { br: identity(br), gzip: identity(gzip) };
    await writeFile(join(directory, release, name), body);
    await writeFile(join(directory, release, name + ".br"), br);
    await writeFile(join(directory, release, name + ".gz"), gzip);
  }
  const manifest = paladinHealerReleaseSchema.parse({
    schema: "kfc-paladin-healer-browser-release.v1",
    profile: "healing-paladin",
    release,
    modelIdentity: index.modelIdentity,
    sourceArchiveSha256: index.candidateSha256,
    preparedAt: "2026-10-26T01:00:00Z",
    files: Object.fromEntries([...contents].map(([name, body]) => [name, identity(body)])),
    encodings,
  });
  await writeFile(join(directory, release, "manifest.json"), JSON.stringify(manifest));
  if (active) await writeFile(join(directory, "active.json"), JSON.stringify(manifest));
  return { directory, manifest, contents };
}

describe("Paladin sharded release delivery", () => {
  it("reads the actual index, complete catalog presentation and source-bound group", async () => {
    const f = await fixture();
    try {
      expect(await readPaladinHealerRelease(f.directory)).toEqual(f.manifest);
      const loaded = await readPaladinHealerIndex(f.manifest, f.directory);
      expect(loaded).toEqual(index);
      expect(await readPaladinHealerPresentation(f.manifest, loaded, f.directory)).toEqual(
        presentation,
      );
      expect(
        await readPaladinHealerGroup(
          f.manifest,
          loaded,
          paladinGroupFixtures[0]!.group.id,
          f.directory,
        ),
      ).toEqual(paladinGroupFixtures[0]);
      expect(await isPaladinHealerAvailable(f.directory)).toBe(true);
      await expect(
        readPaladinHealerGroup(f.manifest, loaded, "missing-group", f.directory),
      ).rejects.toThrow(/Unknown/);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("can review an explicit immutable release without selecting it", async () => {
    const f = await fixture(false);
    try {
      expect(await readPaladinHealerRelease(f.directory)).toBeNull();
      expect(await isPaladinHealerAvailable(f.directory)).toBe(false);
      expect(await readPaladinHealerRelease(f.directory, f.manifest.release)).toEqual(f.manifest);
      expect(await readPaladinHealerRelease(f.directory, "../escape")).toBeNull();
      await expect(readFile(join(f.directory, "active.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("serves Brotli, conditional requests and HEAD without losing transport identities", async () => {
    const f = await fixture();
    try {
      const request = new Request("http://localhost/library-index.json", {
        headers: { "accept-encoding": "gzip, br" },
      });
      const response = await servePaladinHealerAsset(
        request,
        f.manifest.release,
        "library-index.json",
        f.directory,
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(response.headers.get("content-encoding")).toBe("br");
      expect(response.headers.get("content-length")).toBe(String(bytes.length));
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(brotliDecompressSync(bytes)).toEqual(f.contents.get("library-index.json"));
      const head = await servePaladinHealerAsset(
        new Request(request, { method: "HEAD" }),
        f.manifest.release,
        "library-index.json",
        f.directory,
      );
      expect(await head.text()).toBe("");
      expect(head.headers.get("etag")).toBe(response.headers.get("etag"));
      const conditional = await servePaladinHealerAsset(
        new Request(request, {
          headers: {
            "accept-encoding": "br",
            "if-none-match": "W/" + response.headers.get("etag"),
          },
        }),
        f.manifest.release,
        "library-index.json",
        f.directory,
      );
      expect(conditional.status).toBe(304);
      expect(await conditional.text()).toBe("");
      expect(
        (
          await servePaladinHealerAsset(
            new Request(request, { headers: { "accept-encoding": "*;q=0" } }),
            f.manifest.release,
            "healing.wasm",
            f.directory,
          )
        ).status,
      ).toBe(406);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects traversal, unlisted assets, changed bytes, and symlinked files", async () => {
    const f = await fixture();
    try {
      const request = new Request("http://localhost/healing.wasm");
      for (const [release, name] of [
        ["../escape", "healing.wasm"],
        [f.manifest.release, "../active.json"],
        [f.manifest.release, "unlisted.js"],
      ])
        expect((await servePaladinHealerAsset(request, release!, name!, f.directory)).status).toBe(
          404,
        );
      const path = join(f.directory, f.manifest.release, "healing.wasm");
      await writeFile(path, Buffer.alloc(f.manifest.files["healing.wasm"]!.bytes, 120));
      await expect(
        servePaladinHealerAsset(request, f.manifest.release, "healing.wasm", f.directory),
      ).rejects.toThrow(/checksum/);
      await rm(path);
      await symlink(join(f.directory, "active.json"), path);
      await expect(
        servePaladinHealerAsset(request, f.manifest.release, "healing.wasm", f.directory),
      ).rejects.toThrow(/escaped/);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("binds index references to the manifest and the active pointer to the sealed release", async () => {
    const f = await fixture();
    try {
      const changed = structuredClone(f.manifest);
      changed.files["catalog.json"]!.sha256 = "0".repeat(64);
      await expect(readPaladinHealerIndex(changed, f.directory)).rejects.toThrow(
        /differs from its release/,
      );
      await writeFile(join(f.directory, "active.json"), JSON.stringify(changed));
      await expect(readPaladinHealerRelease(f.directory)).rejects.toThrow(/active pointer/);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);
});
