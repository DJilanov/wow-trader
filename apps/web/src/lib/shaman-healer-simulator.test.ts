import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, constants, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  shamanHealerReleaseSchema,
  type ShamanHealerRelease,
} from "@wow-trader/forever-data/shaman-healer-release";
import {
  shamanIndexFixture as index,
  shamanGroupFixture as group,
  shamanCatalogFixture as catalog,
  shamanPresentationFixture as presentation,
} from "./fixtures/shaman-healer-contract";
import {
  readShamanHealerRelease,
  readShamanHealerIndex,
  readShamanHealerGroup,
  readShamanHealerPresentation,
  isShamanHealerAvailable,
  serveShamanHealerAsset,
} from "./shaman-healer-simulator";

const identity = (bytes: Buffer): { bytes: number; sha256: string } => ({
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
});
async function fixture(): Promise<{ directory: string; manifest: ShamanHealerRelease }> {
  const directory = await mkdtemp(join(tmpdir(), "shaman-release-")),
    release = "a".repeat(24);
  await mkdir(join(directory, release));
  const descriptor = index.groups.find((entry) => entry.group.id === group.group.id)!;
  const contents = new Map<string, Buffer>([
    ["library-index.json", Buffer.from(JSON.stringify(index) + "\n")],
    ["catalog.json", Buffer.from(JSON.stringify(catalog) + "\n")],
    [descriptor.asset.file, Buffer.from(JSON.stringify(group) + "\n")],
    ["presentation.json", Buffer.from(JSON.stringify(presentation) + "\n")],
  ]);
  for (const name of ["healing.wasm", "healing-worker.js", "request-codec.js", "wasm_exec.js"])
    contents.set(name, Buffer.from("Transport fixture: " + name));
  const files = Object.fromEntries(
    [index.catalog, ...index.groups.map((entry) => entry.asset)].map((ref) => [
      ref.file,
      { bytes: ref.bytes, sha256: ref.byteSha256 },
    ]),
  );
  const encodings: NonNullable<ShamanHealerRelease["encodings"]> = {};
  for (const [name, bytes] of contents) {
    files[name] = identity(bytes);
    await writeFile(join(directory, release, name), bytes);
    const br = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
    const gzip = gzipSync(bytes);
    await writeFile(join(directory, release, name + ".br"), br);
    await writeFile(join(directory, release, name + ".gz"), gzip);
    encodings[name] = { br: identity(br), gzip: identity(gzip) };
  }
  const manifest = shamanHealerReleaseSchema.parse({
    schema: "kfc-shaman-healer-browser-release.v1",
    release,
    profile: "healing-shaman",
    modelIdentity: index.modelIdentity,
    runtimeIdentity: index.runtimeIdentity,
    libraryIndexSha256: files["library-index.json"]!.sha256,
    preparedAt: "2026-10-26T22:00:00Z",
    files,
    encodings,
  });
  for (const path of [join(directory, "active.json"), join(directory, release, "manifest.json")])
    await writeFile(path, JSON.stringify(manifest));
  return { directory, manifest };
}
describe("Shaman immutable asset delivery", () => {
  it("loads the exact five-race index, default group and profession-filtered presentation", async () => {
    const f = await fixture();
    try {
      expect(await readShamanHealerRelease(f.directory)).toEqual(f.manifest);
      const loaded = await readShamanHealerIndex(f.manifest, f.directory);
      expect(loaded).toEqual(index);
      expect(await readShamanHealerGroup(f.manifest, loaded, group.group.id, f.directory)).toEqual(
        group,
      );
      expect(await readShamanHealerPresentation(f.manifest, loaded, f.directory)).toEqual(
        presentation,
      );
      expect(await isShamanHealerAvailable(f.directory)).toBe(true);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
  it("negotiates Brotli, HEAD, ETags and unacceptable encodings", async () => {
    const f = await fixture();
    try {
      const response = await serveShamanHealerAsset(
        new Request("http://localhost/index", { headers: { "accept-encoding": "br" } }),
        f.manifest.release,
        "library-index.json",
        f.directory,
      );
      expect(response.headers.get("content-encoding")).toBe("br");
      expect(
        JSON.parse(brotliDecompressSync(Buffer.from(await response.arrayBuffer())).toString()),
      ).toEqual(index);
      const cached = await serveShamanHealerAsset(
        new Request("http://localhost/index", {
          headers: {
            "accept-encoding": "br",
            "if-none-match": "W/" + response.headers.get("etag"),
          },
        }),
        f.manifest.release,
        "library-index.json",
        f.directory,
      );
      expect(cached.status).toBe(304);
      const head = await serveShamanHealerAsset(
        new Request("http://localhost/index", { method: "HEAD" }),
        f.manifest.release,
        "library-index.json",
        f.directory,
      );
      expect(await head.text()).toBe("");
      expect(Number(head.headers.get("content-length"))).toBe(
        f.manifest.files["library-index.json"]!.bytes,
      );
      expect(
        (
          await serveShamanHealerAsset(
            new Request("http://localhost/index", {
              headers: { "accept-encoding": "identity;q=0,br;q=0,gzip;q=0" },
            }),
            f.manifest.release,
            "library-index.json",
            f.directory,
          )
        ).status,
      ).toBe(406);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
  it("rejects changed files, divergent active pointers, traversal and symlinks", async () => {
    const f = await fixture();
    try {
      expect(
        (
          await serveShamanHealerAsset(
            new Request("http://localhost"),
            "../escape",
            "library-index.json",
            f.directory,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await serveShamanHealerAsset(
            new Request("http://localhost"),
            f.manifest.release,
            "../escape",
            f.directory,
          )
        ).status,
      ).toBe(404);
      await writeFile(join(f.directory, f.manifest.release, "healing.wasm"), "tampered");
      await expect(
        serveShamanHealerAsset(
          new Request("http://localhost"),
          f.manifest.release,
          "healing.wasm",
          f.directory,
        ),
      ).rejects.toThrow(/size|checksum/);
      await rm(join(f.directory, f.manifest.release, "wasm_exec.js"));
      await symlink(
        join(f.directory, "active.json"),
        join(f.directory, f.manifest.release, "wasm_exec.js"),
      );
      await expect(
        serveShamanHealerAsset(
          new Request("http://localhost"),
          f.manifest.release,
          "wasm_exec.js",
          f.directory,
        ),
      ).rejects.toThrow(/escaped/);
      await writeFile(
        join(f.directory, "active.json"),
        JSON.stringify({ ...f.manifest, modelIdentity: "b".repeat(64) }),
      );
      await expect(readShamanHealerRelease(f.directory)).rejects.toThrow(/pointer/);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
});
