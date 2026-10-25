import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  healingEvidenceJournalSha256,
  readHealingEvidenceJournal,
} from "./healing-evidence-journal.mjs";

async function fixture(t, body) {
  const folder = await mkdtemp(join(tmpdir(), "kfc-evidence-journal-")),
    path = join(folder, "jobs.ndjson");
  t.after(() => rm(folder, { recursive: true, force: true }));
  await writeFile(path, body);
  return path;
}
async function rows(path) {
  const result = [];
  for await (const row of readHealingEvidenceJournal(path)) result.push(row);
  return result;
}

test("journal records and UTF-8 survive stream boundaries without altering evidence", async (t) => {
  const expected = [
      { key: "first", name: "Меч".repeat(70000) },
      { key: "second", values: [1, 2, 3] },
    ],
    body = expected.map((row) => JSON.stringify(row)).join("\n") + "\n",
    path = await fixture(t, body);
  assert.deepEqual(await rows(path), expected);
  assert.equal(await readFile(path, "utf8"), body);
});
test("empty journals and complete CRLF records remain compatible", async (t) => {
  assert.deepEqual(await rows(await fixture(t, "")), []);
  assert.deepEqual(await rows(await fixture(t, '{"key":"a"}\r\n\r\n{"key":"b"}\r\n')), [
    { key: "a" },
    { key: "b" },
  ]);
});
test("partial final records are rejected before replay and preserved exactly", async (t) => {
  for (const body of ['{"key":"a"}\n{"key":', '{"key":"a"}']) {
    const path = await fixture(t, body);
    await assert.rejects(rows(path), /Unterminated healing evidence/);
    assert.equal(await readFile(path, "utf8"), body);
  }
});
test("interior corruption and non-object records fail with an identified line", async (t) => {
  for (const body of ['{"key":"a"}\nnot-json\n', '{"key":"a"}\nnull\n', '{"key":"a"}\n[]\n'])
    await assert.rejects(rows(await fixture(t, body)), /line 2/);
});

test("journal hashing preserves raw bytes and standard SHA-256 identities", async (t) => {
  assert.equal(
    await healingEvidenceJournalSha256(await fixture(t, "")),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    await healingEvidenceJournalSha256(await fixture(t, "abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
