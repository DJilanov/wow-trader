import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePaladinHealerFramePayload } from "@wow-trader/forever-data/paladin-healer-frame";
import { paladinHealerFrameReleaseSchema } from "@wow-trader/forever-data/paladin-healer-frame-release";
import {
  frameIndexFixture as index,
  frameReleaseFixture,
  paladinFrameFixtureBytes,
} from "./fixtures/paladin-healer-frame-contract";
import {
  readPaladinHealerFrame,
  readPaladinHealerFrameLibrary,
  readPaladinHealerFrameRelease,
  servePaladinHealerFrameAsset,
  verifyPaladinHealerFrameEngine,
} from "./paladin-healer-frame-simulator";
import { servePaladinHealerAsset } from "./paladin-healer-simulator";

const payload = parsePaladinHealerFramePayload(
  z
    .object({ assets: z.array(z.object({ payload: z.unknown() })) })
    .parse(
      JSON.parse(
        paladinFrameFixtureBytes("paladin-healer-all-baseline-frames.v2.json.gz").toString("utf8"),
      ),
    )
    .assets.find(
      (entry) =>
        z.object({ frame: z.object({ id: z.string() }) }).parse(entry.payload).frame.id ===
        index.defaultFrameId,
    )!.payload,
);
const identity = (body: Buffer): { bytes: number; sha256: string } => ({
  bytes: body.length,
  sha256: createHash("sha256").update(body).digest("hex"),
});

async function fixture(core = false): Promise<{
  directory: string;
  manifest: typeof frameReleaseFixture;
  contents: Map<string, Buffer>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "paladin-frame-delivery-"));
  const manifest = core
    ? paladinHealerFrameReleaseSchema.parse(
        JSON.parse(
          paladinFrameFixtureBytes("paladin-healer-core-release.v2.json.gz").toString("utf8"),
        ),
      )
    : structuredClone(frameReleaseFixture);
  const contents = new Map<string, Buffer>([
    ["catalog.json", paladinFrameFixtureBytes("paladin-healer-catalog.v2.json.gz")],
    ["presentation.json", paladinFrameFixtureBytes("paladin-healer-presentation.v2.json.gz")],
    [
      "library-index.json",
      paladinFrameFixtureBytes(
        core ? "paladin-healer-core-index.v2.json.gz" : "paladin-healer-frame-index.v2.json.gz",
      ),
    ],
    [
      index.frames.find((entry) => entry.frame.id === index.defaultFrameId)!.asset.file,
      Buffer.from(JSON.stringify(payload) + "\n"),
    ],
  ]);
  for (const name of ["healing.wasm", "healing-worker.js", "request-codec.js", "wasm_exec.js"])
    contents.set(name, Buffer.from("transport fixture: " + name));
  await mkdir(join(directory, manifest.release));
  for (const [name, body] of contents) {
    const br = brotliCompressSync(body),
      gzip = gzipSync(body);
    if (name.endsWith(".json")) expect(identity(body)).toEqual(manifest.files[name]);
    manifest.files[name] = identity(body);
    manifest.encodings![name] = { br: identity(br), gzip: identity(gzip) };
    await writeFile(join(directory, manifest.release, name), body);
    await writeFile(join(directory, manifest.release, name + ".br"), br);
    await writeFile(join(directory, manifest.release, name + ".gz"), gzip);
  }
  paladinHealerFrameReleaseSchema.parse(manifest);
  await writeFile(join(directory, manifest.release, "manifest.json"), JSON.stringify(manifest));
  return { directory, manifest, contents };
}

describe("Paladin frame release delivery", () => {
  it("activates only the complete declared core and rejects a same-count missing assignment", async () => {
    const f = await fixture(true);
    try {
      const manifest = paladinHealerFrameReleaseSchema.parse({
        ...f.manifest,
        status: "published",
        publicationAllowed: true,
        qualification: {
          sourceReviewSha256: "a".repeat(64),
          finalFailureHistoryAuditComplete: true,
          professionTransfersComplete: true,
          selectedBrowserControlsComplete: true,
          hostUiReviewed: true,
        },
      });
      const writeManifest = async (): Promise<void> => {
        const reference = { path: "fixture/library-index.json", byteSha256: manifest.indexSha256 };
        const admission = Buffer.from(
          JSON.stringify({
            schema: "kfc-paladin-healer-frame-admission.v1",
            status: "passed",
            completedAt: manifest.preparedAt,
            scope: manifest.scope,
            release: manifest.release,
            modelIdentity: manifest.modelIdentity,
            runtimeSha256: manifest.runtimeSha256,
            indexSha256: manifest.indexSha256,
            catalogSha256: manifest.catalogSha256,
            preparedFrames: manifest.coverage.preparedFrames,
            preparedConfigurations: manifest.coverage.preparedConfigurations,
            corePresetCoverageComplete: true,
            extendedPresetCoverageComplete: false,
            professionTransfersComplete: true,
            selectedBrowserControlsComplete: true,
            hostUiReviewed: true,
            finalFailureHistoryAuditComplete: true,
            finalFailureAudit: {
              checkedGameplayKeys: 1,
              observedFailureKeys: 0,
              selectedKnownFailures: 0,
              databaseSha256: manifest.indexSha256,
            },
            sourceReview: reference,
            browserReview: reference,
            hostReview: reference,
            checkpoint: reference,
            publicationAllowed: true,
          }),
        );
        manifest.qualification.sourceReviewSha256 = identity(admission).sha256;
        await writeFile(join(f.directory, manifest.release, "qualification.json"), admission);
        await writeFile(
          join(f.directory, manifest.release, "manifest.json"),
          JSON.stringify(manifest),
        );
        await writeFile(join(f.directory, "active.json"), JSON.stringify(manifest));
      };
      await writeManifest();
      expect(await readPaladinHealerFrameRelease(f.directory)).toEqual(manifest);
      const library = await readPaladinHealerFrameLibrary(manifest, f.directory);
      expect(library.index.frames).toHaveLength(270);
      const changed = structuredClone(library.index);
      const entry = changed.frames.find((entry) => entry.frame.assignment === "burst")!;
      entry.frame.variant.durationSeconds = 300;
      entry.frame.id = entry.frame.id.replace(/180$/, "300");
      const bytes = Buffer.from(JSON.stringify(changed));
      manifest.files["library-index.json"] = identity(bytes);
      manifest.indexSha256 = identity(bytes).sha256;
      await writeFile(join(f.directory, manifest.release, "library-index.json"), bytes);
      await writeManifest();
      await expect(readPaladinHealerFrameLibrary(manifest, f.directory)).rejects.toThrow(/missing/);
      const admissionPath = join(f.directory, manifest.release, "qualification.json");
      const admissionBytes = await readFile(admissionPath);
      admissionBytes[0] = 0;
      await writeFile(admissionPath, admissionBytes);
      await expect(readPaladinHealerFrameRelease(f.directory)).rejects.toThrow(/checksum/);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("loads the real catalog, index and default frame without activating a candidate", async () => {
    const f = await fixture();
    try {
      expect(await readPaladinHealerFrameRelease(f.directory)).toBeNull();
      expect(await readPaladinHealerFrameRelease(f.directory, f.manifest.release)).toEqual(
        f.manifest,
      );
      const library = await readPaladinHealerFrameLibrary(f.manifest, f.directory);
      expect(library.index).toEqual(index);
      expect(library.catalog.catalog).toHaveLength(2249);
      expect(library.initialFrame).toEqual(payload);
      await verifyPaladinHealerFrameEngine(f.manifest, f.directory);
      await expect(
        readPaladinHealerFrame(f.manifest, index, "missing", f.directory),
      ).rejects.toThrow(/Unknown/);
      await writeFile(join(f.directory, "active.json"), JSON.stringify(f.manifest));
      await expect(readPaladinHealerFrameRelease(f.directory)).rejects.toThrow(/cannot be active/);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("dispatches Brotli, HEAD and conditional requests through the existing asset route", async () => {
    const f = await fixture();
    try {
      const url = "http://localhost/library-index.json";
      const response = await servePaladinHealerAsset(
        new Request(url, { headers: { "accept-encoding": "gzip, br" } }),
        f.manifest.release,
        "library-index.json",
        f.directory,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-encoding")).toBe("br");
      expect(response.headers.get("vary")).toBe("Accept-Encoding");
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(brotliDecompressSync(bytes)).toEqual(f.contents.get("library-index.json"));
      const etag = response.headers.get("etag")!;
      for (const [method, headers, status] of [
        ["HEAD", { "accept-encoding": "br" }, 200],
        ["GET", { "accept-encoding": "br", "if-none-match": "W/" + etag }, 304],
        ["GET", { "accept-encoding": "identity;q=0, br;q=0, gzip;q=0" }, 406],
      ] as const) {
        const result = await servePaladinHealerFrameAsset(
          new Request(url, { method, headers }),
          f.manifest,
          "library-index.json",
          f.directory,
        );
        expect(result.status).toBe(status);
        expect(await result.text()).toBe("");
      }
      for (const name of [
        "report.json",
        "manifest.json",
        "qualification.json",
        "../catalog.json",
        "catalog.json.br",
      ])
        expect(
          (await servePaladinHealerFrameAsset(new Request(url), f.manifest, name, f.directory))
            .status,
        ).toBe(404);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("detects same-size corruption even after a successful cached check", async () => {
    const f = await fixture();
    try {
      await verifyPaladinHealerFrameEngine(f.manifest, f.directory);
      const path = join(f.directory, f.manifest.release, "request-codec.js");
      const body = Buffer.from(f.contents.get("request-codec.js")!);
      body[0] = body[0]! ^ 1;
      await writeFile(path, body);
      await expect(verifyPaladinHealerFrameEngine(f.manifest, f.directory)).rejects.toThrow(
        /checksum/,
      );
    } finally {
      await rm(f.directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects release symlinks and invalid path segments", async () => {
    const f = await fixture();
    const other = await mkdtemp(join(tmpdir(), "paladin-frame-outside-"));
    try {
      expect(await readPaladinHealerFrameRelease(f.directory, "../escape")).toBeNull();
      const alias = "b".repeat(24);
      await symlink(other, join(f.directory, alias), "dir");
      await writeFile(
        join(other, "manifest.json"),
        JSON.stringify({ ...f.manifest, release: alias }),
      );
      await expect(readPaladinHealerFrameRelease(f.directory, alias)).rejects.toThrow(/escaped/);
    } finally {
      await rm(f.directory, { recursive: true, force: true });
      await rm(other, { recursive: true, force: true });
    }
  }, 30_000);
});
