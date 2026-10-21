import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { pathToFileURL, URL } from "node:url";
import process from "node:process";
import console from "node:console";
import { brotliCompress, brotliDecompress, constants, gzip, gunzip } from "node:zlib";
import { simulatorManifestSchema } from "../packages/forever-data/dist/simulator.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gz = promisify(gzip),
  ungz = promisify(gunzip),
  br = promisify(brotliCompress),
  unbr = promisify(brotliDecompress);
const publicExtensions = new Set([
  "js",
  "css",
  "json",
  "wasm",
  "bin",
  "woff",
  "woff2",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "ico",
  "txt",
]);
const compressible = new Set(["js", "css", "json", "wasm", "bin", "svg", "txt"]);
const privateNames = new Set([
  "manifest.json",
  "kfc-reviewed-presets.json",
  "kfc-preset-safety.json",
]);
const extension = (name) => name.split(".").at(-1)?.toLowerCase();

export function isPublicDeliveryAsset(name) {
  return (
    typeof name === "string" &&
    name.length < 500 &&
    name
      .split("/")
      .every((part) => /^[a-z0-9_][a-z0-9_.-]*$/i.test(part) && !privateNames.has(part)) &&
    publicExtensions.has(extension(name))
  );
}

function inside(root, path) {
  const offset = relative(root, path);
  return offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset);
}

async function selectedReleases(root) {
  const selected = new Set();
  for (const [name, schema] of [
    ["model-update.json", "kfc-simulator-model-update-selection.v1"],
    ["profile-model-updates.json", "kfc-simulator-profile-model-selection.v1"],
  ]) {
    let bytes;
    try {
      bytes = await readFile(join(root, name));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    assert(bytes.length <= 32_000, "Simulator selection exceeds its size budget");
    const pointer = JSON.parse(bytes);
    assert.equal(pointer.schema, schema, "Unknown simulator selection: " + name);
    const entries = name === "model-update.json" ? [pointer] : Object.values(pointer.profiles);
    for (const entry of entries)
      for (const release of [entry.sourceRelease, entry.release]) {
        assert(
          typeof release === "string" && /^[a-f0-9]{24}$/.test(release),
          "Invalid selected release",
        );
        selected.add(release);
      }
  }
  return selected.size
    ? [...selected]
    : (await readdir(root)).filter((name) => /^[a-f0-9]{24}$/.test(name));
}

export function staticDeliveryNginx(publicRoot, { simulator, helper, guild }) {
  assert(
    isAbsolute(publicRoot) && /^[a-z0-9_/. -]+$/i.test(publicRoot),
    "Unsafe Nginx delivery root",
  );
  const common = `root ${JSON.stringify(publicRoot)};
        include /etc/nginx/mime.types;
        default_type application/octet-stream;
        gzip_static on;
        gzip_vary on;
        etag on;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options nosniff;
        add_header Referrer-Policy no-referrer;`;
  const proxy = (name, port, rewrite = "") => `location @${name} {
        ${rewrite}
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }`;
  const locations = [];
  if (simulator)
    locations.push(`location ~ "^/(?:tools/)?forever-sim/(?<delivery_release>[a-f0-9]{24})/(?<delivery_asset>[a-zA-Z0-9_./-]+\\.(?:js|css|json|wasm|bin|woff2?|png|jpe?g|webp|gif|svg|ico|txt))$" {
        ${common}
        limit_req zone=kfc_tools_search_crawlers burst=10 nodelay;
        add_header X-Robots-Tag "noindex, nofollow";
        try_files /forever-sim/$delivery_release/$delivery_asset @kfc_delivery_helper;
    }`);
  if (helper)
    locations.push(`location ^~ /tools/_next/static/ {
        ${common}
        limit_req zone=kfc_tools_search_crawlers burst=10 nodelay;
        try_files $uri @kfc_delivery_helper;
    }`);
  if (guild)
    locations.push(`location ^~ /_next/static/ {
        ${common}
        try_files $uri @kfc_delivery_guild;
    }`);
  if (simulator || helper)
    locations.push(
      proxy(
        "kfc_delivery_helper",
        19210,
        "rewrite ^/forever-sim/(.*)$ /tools/forever-sim/$1 break;",
      ),
    );
  if (guild) locations.push(proxy("kfc_delivery_guild", 19200));
  return locations.join("\n\n") + "\n";
}

export async function prepareStaticDelivery({
  simulatorRoot,
  releases,
  helperStatic,
  guildStatic,
  previousDelivery,
  output,
  prepare = false,
}) {
  assert.equal(typeof prepare, "boolean");
  assert(simulatorRoot || helperStatic || guildStatic, "Select at least one delivery source");
  const sources = [],
    roots = [],
    manifestPins = [];
  async function sourceRoot(path) {
    const root = await realpath(resolve(path));
    assert((await stat(root)).isDirectory());
    roots.push(root);
    return root;
  }
  async function add(root, name, url, expected) {
    assert(isPublicDeliveryAsset(name), "Not a public delivery asset: " + name);
    const path = await realpath(join(root, name));
    assert(inside(root, path), "Delivery source escaped its root");
    const info = await stat(path);
    assert(info.isFile() && info.size <= 100_000_000, "Invalid delivery asset size");
    if (expected) assert.equal(info.size, expected.bytes, "Source size changed: " + url);
    sources.push({
      path,
      url,
      bytes: info.size,
      expectedSha256: expected?.sha256,
      mode: info.mode,
    });
  }
  if (simulatorRoot) {
    const root = await sourceRoot(simulatorRoot),
      selected = releases ?? (await selectedReleases(root));
    assert(
      selected.length > 0 && selected.length <= 64 && new Set(selected).size === selected.length,
    );
    for (const release of [...selected].sort()) {
      assert(/^[a-f0-9]{24}$/.test(release));
      const folder = await realpath(join(root, release));
      assert(inside(root, folder), "Release escaped simulator storage");
      const bytes = await readFile(join(folder, "manifest.json"));
      assert(bytes.length <= 8_000_000);
      const manifest = simulatorManifestSchema.parse(JSON.parse(bytes));
      assert.equal(manifest.release, release);
      manifestPins.push({ release, sha256: sha(bytes), files: Object.keys(manifest.files).length });
      for (const [name, expected] of Object.entries(manifest.files))
        if (isPublicDeliveryAsset(name))
          await add(folder, name, `/forever-sim/${release}/${name}`, expected);
    }
  }
  for (const [path, prefix] of [
    [helperStatic, "/tools/_next/static"],
    [guildStatic, "/_next/static"],
  ]) {
    if (!path) continue;
    const root = await sourceRoot(path);
    async function walk(folder, prefixPath = "") {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        assert(!entry.isSymbolicLink(), "Static delivery will not follow Next asset symlinks");
        const name = prefixPath + entry.name;
        if (entry.isDirectory()) await walk(join(folder, entry.name), name + "/");
        else if (entry.isFile() && isPublicDeliveryAsset(name))
          await add(root, name, prefix + "/" + name);
      }
    }
    await walk(root);
  }
  if (previousDelivery) {
    const previous = await realpath(resolve(previousDelivery)),
      report = JSON.parse(await readFile(join(previous, "completed.json"))),
      root = await sourceRoot(join(previous, "public")),
      currentUrls = new Set(sources.map((row) => row.url));
    assert.equal(report.schema, "kfc-static-delivery.v1");
    assert(Array.isArray(report.files) && report.files.length <= 300_000);
    for (const row of report.files) {
      if (!/^\/(?:tools\/)?_next\/static\//.test(row.url) || currentUrls.has(row.url)) continue;
      await add(root, row.url.slice(1), row.url, { bytes: row.bytes, sha256: row.sha256 });
      currentUrls.add(row.url);
    }
  }
  assert(sources.length > 0 && sources.length <= 300_000, "Unexpected delivery inventory size");
  assert.equal(new Set(sources.map((row) => row.url)).size, sources.length);
  const requested = resolve(output),
    parent = await realpath(dirname(requested)),
    target = join(parent, basename(requested));
  for (const root of roots)
    assert(
      target !== root && !inside(root, target) && !inside(target, root),
      "Delivery output overlaps source storage",
    );
  const summary = {
    schema: "kfc-static-delivery.v1",
    files: sources.length,
    sourceBytes: sources.reduce((sum, row) => sum + row.bytes, 0),
    manifestPins,
    prepare,
    compressionWorkers: 2,
  };
  if (!prepare) return { ...summary, filesystemWrites: 0 };
  const reserve = 1024 ** 3,
    disk = await statfs(parent),
    limit = Math.min(2 * 1024 ** 3, disk.bavail * disk.bsize - reserve);
  assert(limit > 0, "Need at least1GiB free disk reserve before delivery preparation");
  let additionalBytes = 0;
  function account(bytes) {
    additionalBytes += bytes;
    assert(additionalBytes <= limit, "Static delivery exceeded its additional disk budget");
  }
  try {
    await lstat(target);
    assert.fail("Use a new delivery directory; existing outputs are never overwritten");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(target);
  const publicRoot = join(target, "public"),
    results = [],
    unique = new Map();
  await mkdir(publicRoot);
  let next = 0;
  async function immutableLink(source, destination, readable = true) {
    await mkdir(dirname(destination), { recursive: true });
    if (readable) {
      try {
        await link(source, destination);
        return;
      } catch (error) {
        if (error.code !== "EXDEV") throw error;
      }
    }
    account((await stat(source)).size);
    await copyFile(source, destination);
    if (!readable) {
      const { chmod } = await import("node:fs/promises");
      await chmod(destination, 0o644);
    }
  }
  async function processSource(row) {
    const bytes = await readFile(row.path),
      digest = sha(bytes);
    assert.equal(bytes.length, row.bytes, "Source changed while preparing delivery");
    if (row.expectedSha256)
      assert.equal(digest, row.expectedSha256, "Source checksum changed: " + row.url);
    const destination = join(publicRoot, row.url.slice(1));
    const key = digest + ":" + compressible.has(extension(row.url));
    let pending = unique.get(key);
    if (!pending) {
      pending = (async () => {
        await immutableLink(row.path, destination, Boolean(row.mode & 0o004));
        const encodings = {};
        if (bytes.length >= 1024 && compressible.has(extension(row.url))) {
          for (const [name, encode, decode, suffix] of [
            ["gzip", () => gz(bytes, { level: 5 }), ungz, ".gz"],
            [
              "br",
              () => br(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
              unbr,
              ".br",
            ],
          ]) {
            const encoded = await encode();
            if (encoded.length >= bytes.length * 0.95) continue;
            assert.equal(sha(await decode(encoded)), digest, "Compressed asset failed roundtrip");
            account(encoded.length);
            await writeFile(destination + suffix, encoded, { flag: "wx", mode: 0o644 });
            encodings[name] = {
              bytes: encoded.length,
              sha256: sha(encoded),
              path: destination + suffix,
            };
          }
        }
        return { path: destination, encodings };
      })();
      unique.set(key, pending);
    }
    const original = await pending;
    if (original.path !== destination) {
      await immutableLink(original.path, destination);
      for (const [name, ref] of Object.entries(original.encodings))
        await immutableLink(ref.path, destination + (name === "br" ? ".br" : ".gz"));
    }
    results.push({
      url: row.url,
      bytes: bytes.length,
      sha256: digest,
      encodings: Object.fromEntries(
        Object.entries(original.encodings).map(([name, ref]) => [
          name,
          { bytes: ref.bytes, sha256: ref.sha256 },
        ]),
      ),
    });
  }
  let failure;
  await Promise.allSettled(
    Array.from({ length: 2 }, async () => {
      try {
        while (!failure && next < sources.length) {
          const row = sources[next++];
          await processSource(row);
        }
      } catch (error) {
        failure ??= error;
        throw error;
      }
    }),
  );
  if (failure) throw failure;
  const remaining = await statfs(parent);
  assert(
    remaining.bavail * remaining.bsize >= reserve,
    "Disk reserve was consumed during delivery preparation",
  );
  results.sort((a, b) => a.url.localeCompare(b.url, "en"));
  const report = {
    ...summary,
    uniqueContents: unique.size,
    files: results,
    additionalBytes,
    generatorSha256: sha(await readFile(import.meta.filename)),
    additionalCompressedBytes: [...unique.values()].length
      ? (await Promise.all([...unique.values()])).reduce(
          (sum, row) => sum + Object.values(row.encodings).reduce((n, entry) => n + entry.bytes, 0),
          0,
        )
      : 0,
  };
  await writeFile(
    join(target, "nginx-locations.conf"),
    staticDeliveryNginx(publicRoot, {
      simulator: Boolean(simulatorRoot),
      helper: Boolean(helperStatic),
      guild: Boolean(guildStatic),
    }),
    { flag: "wx", mode: 0o644 },
  );
  await copyFile(
    new URL("../infra/nginx/static-delivery-smoke.conf", import.meta.url),
    join(target, "nginx-smoke.conf"),
  );
  await writeFile(join(target, "completed.json"), JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return {
    schema: report.schema,
    files: results.length,
    uniqueContents: unique.size,
    sourceBytes: summary.sourceBytes,
    additionalCompressedBytes: report.additionalCompressedBytes,
    additionalBytes,
    output: target,
    activated: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      "simulator-root": { type: "string" },
      release: { type: "string", multiple: true },
      "helper-static": { type: "string" },
      "guild-static": { type: "string" },
      "previous-delivery": { type: "string" },
      output: { type: "string" },
      prepare: { type: "boolean", default: false },
    },
  });
  assert(values.output, "--output is required");
  prepareStaticDelivery({
    simulatorRoot: values["simulator-root"],
    releases: values.release,
    helperStatic: values["helper-static"],
    guildStatic: values["guild-static"],
    previousDelivery: values["previous-delivery"],
    output: values.output,
    prepare: values.prepare,
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
