import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import process from "node:process";
import { deflateSync, inflateSync } from "node:zlib";
import { parseArgs } from "node:util";
import { build } from "tsup";
import { groupRestedXpDocumentsByLevel } from "./restedxp-level-groups.mjs";
import {
  clipGuidePlan,
  renderGuideDownload,
  tbcPreviewGuide,
} from "./leveling-guide-download/prepare.mjs";
import { verifyCampaignAddonReview } from "./campaign-addon-review-check.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
function inside(file) {
  const path = resolve(root, file),
    local = relative(root, path);
  assert(
    local && !local.startsWith("..") && !local.startsWith("/"),
    "Guide input must be inside the repository.",
  );
  return path;
}
async function pinned(record) {
  const bytes = await readFile(inside(record.file));
  assert.equal(sha(bytes), record.sha256, `Guide input changed: ${record.file}`);
  return JSON.parse(bytes.toString("utf8"));
}

async function main() {
  const { values } = parseArgs({
    options: { open: { type: "boolean" }, source: { type: "string" } },
  });
  const manifest = await read(inside(values.source ?? "data/leveling/local-download/current.json"));
  assert.equal(manifest.schema, "kfc-local-guide-source.v1");
  const [plan, scope, qualification] = await Promise.all([
    pinned(manifest.plan),
    pinned(manifest.scope),
    pinned(manifest.qualification),
  ]);
  assert(
    qualification.allChecksPassed && qualification.checks.allPrimaryWorkloadsCompleteSM,
    "The source route has not passed the required through-SM checks.",
  );
  assert.equal(qualification.planSha256, manifest.plan.sha256);
  assert.equal(qualification.throughActionId, manifest.throughActionId,
    "The reviewed endpoint differs from the requested download.");
  assert(qualification.checks.allPrimaryWorkloadsReachEndpoint,
    "Every primary workload must reach the download endpoint.");
  const frozen = dirname(inside(manifest.scope.file));
  const enginePins = Object.fromEntries(
    await Promise.all(
      (await readdir(join(frozen, "runtime")))
        .filter((file) => file.endsWith(".js"))
        .sort()
        .map(async (file) => [file, sha(await readFile(join(frozen, "runtime", file)))]),
    ),
  );
  assert.equal(
    sha(JSON.stringify(enginePins)),
    scope.engineSha256,
    "The qualified export engine changed.",
  );
  assert.equal(qualification.engine, scope.engineSha256);
  const api = await import(pathToFileURL(join(frozen, "runtime/index.js")).href);
  assert.equal(qualification.compiler, api.CAMPAIGN_ADDON_COMPILER_REVISION,
    "The qualified compiler differs from the pinned export engine.");
  const sources = [];
  for (const entry of scope.sources) {
    const bytes = await readFile(inside(entry.file));
    assert.equal(sha(bytes), entry.sha256, entry.file);
    sources.push({
      reference: api.CHAPTER_REFERENCES.find((row) => row.id === entry.chapterId),
      guide: api.importedChapterSchema.parse(JSON.parse(bytes.toString("utf8"))),
    });
  }
  const codecFile = join(frozen, "verified-source/restedxp-import.ts");
  assert.equal(
    sha(await readFile(codecFile)),
    scope.sourcePins["packages/leveling/src/restedxp-import.ts"],
  );
  const prefix = clipGuidePlan(plan, manifest.throughActionId);
  assert.equal(sha(JSON.stringify(prefix)), qualification.clippedPlanSha256,
    "The clipped guide differs from the qualified download.");
  assert(prefix.sharedQuestsOnly && prefix.race === "human" && prefix.leaderClass === "warrior");
  const initial = api.emptyPremadeProgress();
  const progress = {
    ...initial,
    difficultyPolicy: "experienced-premade",
    raidGoals: true,
    dungeonFinish: { ...initial.dungeonFinish, strategy: "dungeons" },
  };
  const actions = api.activeCampaignActions(prefix, progress);
  assert.equal(actions.at(-1)?.id, manifest.throughActionId);
  const options = {
    version: "0.2.0-local-sm",
    runtimeBuild: manifest.runtimeBuild,
    interfaceVersion: manifest.interfaceVersion,
    restedXpVersion: manifest.restedXpVersion,
    nativeSources: sources,
    includeObservers: false,
  };
  const artifact = api.compileCampaignAddon(prefix, actions, options);
  verifyCampaignAddonReview(prefix, actions, artifact, {
    ...options,
    selection: api.campaignExportSelectionFromProgress(progress),
  }, api);
  const documents = artifact.documents
    .filter((document) => document.role === "party")
    .map((document) => document.content);
  assert(documents.length && !/^#next /m.test(documents.at(-1)));
  const guides = {
    forever: groupRestedXpDocumentsByLevel(documents, "KFC Group Leveling"),
    tbc: groupRestedXpDocumentsByLevel(documents.map(tbcPreviewGuide), "KFC TBC Preview"),
  };
  const compression = {
    compressZlib: async (bytes) => deflateSync(bytes),
    decompressZlib: async (bytes, maximum) => inflateSync(bytes, { maxOutputLength: maximum }),
  };
  for (const texts of Object.values(guides)) {
    const encoded = await api.encodeRestedXpImport(texts, "GuideReview#1234", compression);
    assert.deepEqual(
      (await api.decodeRestedXpImport(encoded, "GuideReview#1234", compression)).guides,
      texts,
    );
  }
  const output = join(root, "artifacts/leveling/local-download");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "kfc-guide-download-"));
  try {
    const entry = join(temporary, "entry.ts");
    await writeFile(
      entry,
      `import * as codec from ${JSON.stringify(codecFile)};\nimport {startGuideDownload} from ${JSON.stringify(join(root, "scripts/leveling-guide-download/browser.ts"))};\nstartGuideDownload(codec);\n`,
    );
    await build({
      entry: [entry],
      format: ["iife"],
      platform: "browser",
      target: "es2022",
      outDir: temporary,
      outExtension: () => ({ js: ".global.js" }),
      minify: true,
      sourcemap: false,
      splitting: false,
      clean: false,
      silent: true,
      config: false,
    });
    const javascript = await readFile(join(temporary, "entry.global.js"), "utf8");
    const [template, css] = await Promise.all(
      ["page.html", "style.css"].map((file) =>
        readFile(join(root, "scripts/leveling-guide-download", file), "utf8"),
      ),
    );
    const html = renderGuideDownload(template, css, javascript, guides, plan.release,
      manifest.presentation);
    const file = join(output, "index.html");
    await writeFile(file, html, { mode: 0o600 });
    await writeFile(
      join(output, "verification.json"),
      JSON.stringify(
        {
          schema: "kfc-local-guide-download.v1",
          sourcePlanSha256: manifest.plan.sha256,
          throughActionId: manifest.throughActionId,
          coverage: manifest.coverage,
          publication: "local-preview",
          engineSha256: scope.engineSha256,
          compiler: api.CAMPAIGN_ADDON_COMPILER_REVISION,
          restedXpVersion: manifest.restedXpVersion,
          actions: actions.length,
          guidesPerMode: documents.length,
          htmlSha256: sha(html),
          groups: [...new Set(guides.forever.map((text) => /^#group (.+)$/m.exec(text)[1]))],
          guideReady: false,
          nativeReviewPassed: true,
          transportRoundTripsPassed: true,
          accountContextLogged: false,
        },
        null,
        2,
      ) + "\n",
    );
    process.stdout.write(
      JSON.stringify({ page: file, coverage: manifest.coverage, guides: documents.length }) + "\n",
    );
    if (values.open && process.platform === "darwin")
      execFile("open", [file], (error) => {
        if (error) process.stderr.write("Open the generated index.html in your browser.\n");
      });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    (error instanceof Error ? error.message : "Guide download preparation failed.") + "\n",
  );
  process.exitCode = 1;
});
