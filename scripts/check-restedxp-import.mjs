import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import process from "node:process";
import { parseArgs } from "node:util";
import {
  encodeRestedXpImport,
  decodeRestedXpImport,
  restedXpDocumentSetSchema,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  args: process.argv.slice(process.argv[2] === "--" ? 3 : 2),
  options: {
    documents: { type: "string" },
    "addon-root": { type: "string" },
    lua: { type: "string" },
  },
});
const root = resolve(import.meta.dirname, "..");
const addon = resolve(values["addon-root"] ?? join(root, ".cache/restedxp/v4.11.27"));
const lua = resolve(values.lua ?? join(root, ".cache/restedxp/lua-5.1.5/src/lua"));
const revision = execFileSync("git", ["-C", addon, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(revision, "ce1e51daf5e0f5cf727903d82e7269947ac27d73");
execFileSync(
  "git",
  [
    "-C",
    addon,
    "diff",
    "--exit-code",
    "HEAD",
    "--",
    "GuideLoader.lua",
    "functions.lua",
    "libs/LibDeflate/LibDeflate.lua",
    "libs/plc/base64.lua",
  ],
  { stdio: "ignore" },
);
async function readDocuments(path) {
  const file = resolve(path);
  const info = await stat(file);
  assert(
    info.isFile() && info.size <= 12_000_000,
    "Document set exceeds its regular-file size limit.",
  );
  const raw = await readFile(file, "utf8");
  assert(Buffer.byteLength(raw) <= 12_000_000, "Document set exceeds its size limit.");
  return restedXpDocumentSetSchema.parse(JSON.parse(raw));
}
const set = values.documents ? await readDocuments(values.documents) : null;
const documents = set
  ? set.documents.map((document) => document.content)
  : [
      "#forever\n#name 01 · Transport fixture\n#group KFC Transport Fixture\n#version 1\nstep\n    #label fixture-accept\n    .accept 783 >> Accept a quest\nstep\n    .complete 783,1 >> Complete its objective — UTF-8\nstep\n    .turnin 783 >> Hand in the quest\n",
    ];
assert(Array.isArray(documents) && documents.every((document) => typeof document === "string"));
const functions = await readFile(join(addon, "functions.lua"), "utf8");
const available = new Set(
  [
    ...functions.matchAll(/function addon\.functions\.(\w+)\s*\(/g),
    ...functions.matchAll(/addon\.functions\["(\w+)"\]\s*=\s*function/g),
  ].map((match) => match[1]),
);
const commands = [
  ...new Set(
    documents.flatMap((document) =>
      [...document.matchAll(/^\s*\.(\w+)\b/gm)].map((match) => match[1]),
    ),
  ),
].sort();
for (const command of commands)
  assert(
    available.has(command),
    `Generated instruction .${command} is absent from pinned upstream functions.lua.`,
  );
const compression = {
  compressZlib: async (bytes) => deflateSync(bytes),
  decompressZlib: async (bytes, maximumBytes) =>
    inflateSync(bytes, { maxOutputLength: maximumBytes }),
};
const directory = await mkdtemp(join(tmpdir(), "kfc-restedxp-oracle-"));
const checks = [];
const contexts = new Map();
const races = {
  human: "Human",
  dwarf: "Dwarf",
  gnome: "Gnome",
  "night-elf": "NightElf",
  skyborne: "Skyborne",
};
if (set?.edition) {
  for (const document of set.documents) {
    const player =
      document.role === "party"
        ? (set.edition.partyStarter ?? set.edition.leader)
        : set.edition.leader;
    const key = `${player.race}/${player.classSlug}`;
    if (!contexts.has(key)) contexts.set(key, { ...player, documents: [] });
    contexts.get(key).documents.push(document.content);
  }
} else contexts.set("human/warrior", { race: "human", classSlug: "warrior", documents });
try {
  await writeFile(join(directory, "commands.txt"), commands.join("\n"), { mode: 0o600 });
  for (const [context, player] of contexts) {
    const documents = player.documents;
    await writeFile(join(directory, "documents.bin"), documents.join("\0"), { mode: 0o600 });
    for (const [index, account] of [
      "KfcFixture#1234",
      "LongFixtureName123#123456",
      "ÅBC测试#12345",
    ].entries()) {
      const encoded = await encodeRestedXpImport(documents, account, compression);
      assert.deepEqual(
        (await decodeRestedXpImport(encoded, account, compression)).guides,
        documents,
      );
      await writeFile(join(directory, "import.txt"), encoded, { mode: 0o600 });
      await writeFile(join(directory, "account.txt"), account, { mode: 0o600 });
      const run = (expected) =>
        JSON.parse(
          execFileSync(
            lua,
            [
              join(root, "scripts/fixtures/restedxp-import-harness.lua"),
              addon,
              join(directory, "import.txt"),
              join(directory, "documents.bin"),
              join(directory, "account.txt"),
              expected,
              join(directory, "commands.txt"),
              races[player.race],
              player.classSlug.toUpperCase(),
            ],
            { encoding: "utf8", timeout: 120000, maxBuffer: 1000000 },
          ),
        );
      checks.push({ context, case: index, ...run("valid") });
      await writeFile(join(directory, "account.txt"), "DifferentFixture#9876", { mode: 0o600 });
      checks.push({ context, case: index, wrongAccount: true, ...run("invalid") });
    }
  }
  process.stdout.write(
    JSON.stringify({
      status: "passed",
      restedXpVersion: "v4.11.27",
      revision,
      loaderSha256: createHash("sha256")
        .update(await readFile(join(addon, "GuideLoader.lua")))
        .digest("hex"),
      luaVersion: "5.1",
      checks,
      limitations: [
        "Native command constructors are test doubles; in-game APIs and gameplay require owner validation.",
      ],
    }) + "\n",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
