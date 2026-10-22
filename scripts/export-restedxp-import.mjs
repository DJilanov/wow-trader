import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import process from "node:process";
import { parseArgs } from "node:util";
import {
  encodeRestedXpImport,
  decodeRestedXpImport,
  restedXpDocumentSetSchema,
} from "../packages/leveling/dist/index.js";

async function bounded(path, maximum) {
  const info = await stat(path);
  assert(info.isFile() && info.size <= maximum, "Input exceeds its regular-file size limit.");
  return readFile(path, "utf8");
}

async function accountInput(path) {
  if (path) return (await bounded(resolve(path), 256)).trim();
  if (process.stdin.isTTY)
    throw new Error(
      "Provide --account-file=<private file> or pipe your BattleTag to stdin; do not put it in command-line arguments.",
    );
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 256) throw new Error("Account input exceeds its size limit.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(process.argv[2] === "--" ? 3 : 2),
    options: {
      documents: { type: "string" },
      "account-file": { type: "string" },
      output: { type: "string" },
      role: { type: "string", default: "all" },
    },
  });
  assert(
    values.documents && values.output,
    "Use --documents=<review guides.json> --output=<new import.txt> [--account-file=<private file>] [--role=all|leader|party].",
  );
  assert(["all", "leader", "party"].includes(values.role), "Unknown guide role.");
  const raw = await bounded(resolve(values.documents), 12000000);
  const set = restedXpDocumentSetSchema.parse(JSON.parse(raw));
  assert.equal(
    set.restedXpVersion,
    "v4.11.27",
    "Stock export is verified only against RestedXP v4.11.27; rebuild an old review package.",
  );
  const documents = set.documents.filter(
    (document) => values.role === "all" || document.role === values.role,
  );
  if (
    values.role === "all" &&
    set.edition?.partyStarter &&
    (set.edition.partyStarter.race !== set.edition.leader.race ||
      set.edition.partyStarter.classSlug !== set.edition.leader.classSlug)
  )
    throw new Error(
      "Mixed-race/class document sets require --role=leader or --role=party. Import only your character's group.",
    );
  const texts = documents.map((document) => document.content);
  const account = await accountInput(values["account-file"]);
  const compression = {
    compressZlib: async (bytes) => deflateSync(bytes, { level: 9 }),
    decompressZlib: async (bytes, maximumBytes) =>
      inflateSync(bytes, { maxOutputLength: maximumBytes }),
  };
  const encoded = await encodeRestedXpImport(texts, account, compression);
  assert.deepEqual(
    (await decodeRestedXpImport(encoded, account, compression)).guides,
    texts,
    "Export changed guide document bytes.",
  );
  const output = resolve(values.output);
  await writeFile(output, encoded, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    JSON.stringify({
      status: "review-import-written",
      output,
      bytes: Buffer.byteLength(encoded),
      sha256: createHash("sha256").update(encoded).digest("hex"),
      sourceDocumentsSha256: createHash("sha256").update(raw).digest("hex"),
      guides: documents.length,
      role: values.role,
      compilerRevision: set.compilerRevision,
      routeRelease: set.routeRelease,
      runtimeBuild: set.runtimeBuild,
      restedXpVersion: set.restedXpVersion,
      accountContextLogged: false,
      inGameValidated: false,
    }) + "\n",
  );
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "RestedXP export failed.") + "\n");
  process.exitCode = 1;
});
