import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { type HealerRelease } from "@wow-trader/forever-data/healing-simulator";
import {
  anyHealerReleaseSchema,
  type AnyHealerRelease,
  type HealerProfile,
} from "@wow-trader/forever-data/healer-workspace";
import {
  readDruidHealerRelease,
  readHealerRelease,
  selectHealerEncoding,
  serveHealerAsset,
} from "./healer-simulator";

async function fixture(
  profile: HealerProfile = "healing-priest",
): Promise<{ directory: string; manifest: AnyHealerRelease; body: Buffer }> {
  const directory = await mkdtemp(join(tmpdir(), "healer-assets-")),
    release = "a".repeat(24),
    body = Buffer.from("healer asset transport regression control"),
    identity = (bytes: Buffer): { bytes: number; sha256: string } => ({
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }),
    names = [
      "library.json",
      "healing.wasm",
      "healing-worker.js",
      "request-codec.js",
      "wasm_exec.js",
    ],
    br = brotliCompressSync(body),
    gzip = gzipSync(body),
    manifest = anyHealerReleaseSchema.parse({
      schema: "kfc-healer-browser-release.v1",
      release,
      modelIdentity: "b".repeat(64),
      profile,
      preparedAt: "2026-10-24T00:00:00Z",
      files: Object.fromEntries(names.map((name) => [name, identity(body)])),
      encodings: Object.fromEntries(
        names.map((name) => [name, { br: identity(br), gzip: identity(gzip) }]),
      ),
    });
  await mkdir(join(directory, release));
  for (const name of names) {
    await writeFile(join(directory, release, name), body);
    await writeFile(join(directory, release, name + ".br"), br);
    await writeFile(join(directory, release, name + ".gz"), gzip);
  }
  await writeFile(join(directory, release, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(directory, "active.json"), JSON.stringify(manifest));
  return { directory, manifest, body };
}

describe("Optional healer asset delivery", () => {
  it.each([
    [null, "identity"],
    ["gzip, br", "br"],
    ["br;q=0, gzip;q=0.5", "gzip"],
    ["br;q=0.1, identity;q=0.8", "identity"],
    ["*;q=0", null],
    ["identity;q=0, br;q=1", "br"],
    ["br;q=invalid, gzip;q=0", "identity"],
  ])("negotiates %s as %s", (header, expected) => {
    expect(selectHealerEncoding(header)).toBe(expected);
  });

  it("streams immutable compressed assets, with correct HEAD and conditional responses", async () => {
    const f = await fixture();
    try {
      expect(await readHealerRelease(f.directory)).toEqual(f.manifest);
      const request = new Request("http://localhost/healing.wasm", {
          headers: { "accept-encoding": "br" },
        }),
        response = await serveHealerAsset(request, f.manifest.release, "healing.wasm", f.directory),
        payload = Buffer.from(await response.arrayBuffer());
      expect(payload).toEqual(brotliCompressSync(f.body));
      expect(response.headers.get("content-encoding")).toBe("br");
      expect(response.headers.get("content-type")).toBe("application/wasm");
      expect(response.headers.get("content-length")).toBe(String(payload.length));
      expect(response.headers.get("cache-control")).toContain("immutable");
      const head = await serveHealerAsset(
        new Request(request, { method: "HEAD" }),
        f.manifest.release,
        "healing.wasm",
        f.directory,
      );
      expect(head.headers.get("etag")).toBe(response.headers.get("etag"));
      expect(await head.text()).toBe("");
      const conditional = await serveHealerAsset(
        new Request(request, {
          headers: {
            "accept-encoding": "br",
            "if-none-match": "W/" + response.headers.get("etag"),
          },
        }),
        f.manifest.release,
        "healing.wasm",
        f.directory,
      );
      expect(conditional.status).toBe(304);
      expect(await conditional.text()).toBe("");
      const denied = await serveHealerAsset(
        new Request(request, { headers: { "accept-encoding": "*;q=0" } }),
        f.manifest.release,
        "healing.wasm",
        f.directory,
      );
      expect(denied.status).toBe(406);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });

  it("rejects corrupt bytes, escaped paths and symlinked assets", async () => {
    const f = await fixture();
    try {
      const request = new Request("http://localhost/healing.wasm"),
        path = join(f.directory, f.manifest.release, "healing.wasm");
      expect(
        (await serveHealerAsset(request, "../escape", "healing.wasm", f.directory)).status,
      ).toBe(404);
      expect(
        (await serveHealerAsset(request, f.manifest.release, "../active.json", f.directory)).status,
      ).toBe(404);
      await writeFile(path, Buffer.alloc(f.body.length, 120));
      await expect(
        serveHealerAsset(request, f.manifest.release, "healing.wasm", f.directory),
      ).rejects.toThrow("checksum");
      await rm(path);
      await symlink(join(f.directory, "active.json"), path);
      await expect(
        serveHealerAsset(request, f.manifest.release, "healing.wasm", f.directory),
      ).rejects.toThrow("escaped");
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });

  it("keeps activation separate from required legacy DPS pages and detects pointer drift", async () => {
    const f = await fixture();
    try {
      expect("pages" in f.manifest).toBe(false);
      const changed = JSON.parse(
        await readFile(join(f.directory, "active.json"), "utf8"),
      ) as HealerRelease;
      changed.modelIdentity = "c".repeat(64);
      await writeFile(join(f.directory, "active.json"), JSON.stringify(changed));
      await expect(readHealerRelease(f.directory)).rejects.toThrow("differs");
      expect(await readHealerRelease(f.directory, f.manifest.release)).toEqual(f.manifest);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
  it("serves Druid’s immutable assets and rejects cross-class manifest confusion", async () => {
    const f = await fixture("healing-druid");
    try {
      expect(await readDruidHealerRelease(f.directory)).toEqual(f.manifest);
      await expect(readHealerRelease(f.directory)).rejects.toThrow("class mismatch");
      const response = await serveHealerAsset(
        new Request("http://localhost/healing.wasm", {
          headers: { "accept-encoding": "gzip" },
        }),
        f.manifest.release,
        "healing.wasm",
        f.directory,
        "healing-druid",
      );
      expect(response.headers.get("content-encoding")).toBe("gzip");
      expect(Buffer.from(await response.arrayBuffer())).toEqual(gzipSync(f.body));
      await expect(
        serveHealerAsset(
          new Request("http://localhost/healing.wasm"),
          f.manifest.release,
          "healing.wasm",
          f.directory,
        ),
      ).rejects.toThrow("class mismatch");
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  });
});
