import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import { prepareClientValuation } from "./addon-valuation-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: options } = parseArgs({
  options: { source: { type: "string" }, archive: { type: "boolean" }, check: { type: "boolean" } },
  strict: true,
});
const dataRoot = path.join(root, "data/trader");
const pointerFile = path.join(dataRoot, "client-valuation-source.json");
let source = options.source;
let expectedHash;
if (!source) {
  const pointer = JSON.parse(await readFile(pointerFile, "utf8"));
  if (
    pointer.schema !== "client-valuation-source.v1" ||
    !/^client-valuation-\d+\.json\.gz$/u.test(pointer.filename) ||
    !/^[a-f0-9]{64}$/u.test(pointer.sha256)
  )
    throw new Error("Invalid archived client valuation source.");
  source = path.join(dataRoot, pointer.filename);
  expectedHash = pointer.sha256;
}
const input = await readFile(path.resolve(source));
if (expectedHash && createHash("sha256").update(input).digest("hex") !== expectedHash)
  throw new Error("Archived client evidence checksum does not match.");
const bytes = source.endsWith(".gz")
  ? gunzipSync(input, { maxOutputLength: 64 * 1024 * 1024 })
  : input;
const prepared = prepareClientValuation(bytes.toString("utf8"));
const output = path.join(root, "apps/addon/WowTraderCollector/ClientValuationData.lua");
if (options.archive) {
  if (options.check) throw new Error("Archiving and read-only checks are separate operations.");
  await mkdir(dataRoot, { recursive: true });
  const filename = `client-valuation-${prepared.summary.build}.json.gz`;
  const compressed = gzipSync(bytes);
  await writeFile(path.join(dataRoot, filename), compressed);
  await writeFile(
    pointerFile,
    `${JSON.stringify(
      {
        schema: "client-valuation-source.v1",
        filename,
        sha256: createHash("sha256").update(compressed).digest("hex"),
        evidenceSha256: prepared.summary.sha256,
      },
      null,
      2,
    )}\n`,
  );
}
if (options.check) {
  if ((await readFile(output, "utf8")) !== prepared.lua)
    throw new Error("Client valuation data differs from its evidence snapshot.");
} else await writeFile(output, prepared.lua);
process.stdout.write(`${JSON.stringify(prepared.summary)}\n`);
