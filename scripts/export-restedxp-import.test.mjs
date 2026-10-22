import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { deflateSync, inflateSync } from "node:zlib";
import { decodeRestedXpImport } from "../packages/leveling/dist/index.js";

const account = "KfcCliOnlyFixture#1234";
const script = resolve(import.meta.dirname, "export-restedxp-import.mjs");
const compression = {
  compressZlib: async (bytes) => deflateSync(bytes),
  decompressZlib: async (bytes, maximumBytes) =>
    inflateSync(bytes, { maxOutputLength: maximumBytes }),
};

function fixture() {
  return {
    schema: "kfc-restedxp-documents.v1",
    publication: "review",
    compilerRevision: "cli-test-v1",
    routeRelease: "cli-test-route",
    sourceBuild: 70205,
    runtimeBuild: 70450,
    restedXpVersion: "v4.11.27",
    edition: { leader: { race: "human", classSlug: "warrior" } },
    selection: {},
    documents: ["leader", "party"].map((role) => ({
      role,
      group: "KFC CLI " + role,
      name: "01 Test",
      content:
        "#forever\n#name 01 Test\n#group KFC CLI " +
        role +
        "\nstep\n    >> Follow the road — test only.\n",
      actionIds: [role + "-action"],
    })),
  };
}

async function withFixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "kfc-restedxp-cli-"));
  try {
    const documents = join(directory, "guides.json");
    const output = join(directory, "import.txt");
    const set = fixture();
    await writeFile(documents, JSON.stringify(set));
    const invoke = (args = [], input = account) =>
      spawnSync(
        process.execPath,
        [script, "--documents=" + documents, "--output=" + output, ...args],
        { input, encoding: "utf8", timeout: 15000 },
      );
    await run({ directory, documents, output, set, invoke });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("CLI exports exact selected documents with private permissions and no account in logs", async () => {
  await withFixture(async ({ output, set, invoke }) => {
    const result = invoke(["--role=leader"]);
    assert.equal(result.status, 0, result.stderr);
    assert(!result.stdout.includes(account));
    assert(!result.stderr.includes(account));
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.guides, 1);
    assert.equal(receipt.role, "leader");
    assert.equal(receipt.inGameValidated, false);
    assert.equal(receipt.accountContextLogged, false);
    const encoded = await readFile(output, "utf8");
    assert(!encoded.includes(account));
    assert.deepEqual((await decodeRestedXpImport(encoded, account, compression)).guides, [
      set.documents[0].content,
    ]);
    if (process.platform !== "win32") assert.equal((await stat(output)).mode & 0o777, 0o600);
    const duplicate = invoke(["--role=leader"]);
    assert.notEqual(duplicate.status, 0);
    assert.equal(await readFile(output, "utf8"), encoded);
  });
});

test("CLI accepts a private account file instead of a command-line account", async () => {
  await withFixture(async ({ directory, output, set, invoke }) => {
    const file = join(directory, "account.txt");
    await writeFile(file, account + "\n", { mode: 0o600 });
    const result = invoke(["--account-file=" + file, "--role=party"], "");
    assert.equal(result.status, 0, result.stderr);
    assert(!result.stdout.includes(account));
    assert.deepEqual(
      (await decodeRestedXpImport(await readFile(output, "utf8"), account, compression)).guides,
      [set.documents[1].content],
    );
  });
});

test("CLI accepts the package-manager argument separator used by the documented commands", async () => {
  await withFixture(async ({ documents, output }) => {
    const result = spawnSync(
      process.execPath,
      [script, "--", "--documents=" + documents, "--output=" + output, "--role=party"],
      { input: account, encoding: "utf8", timeout: 15000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).guides, 1);
  });
});

test("CLI requires a single character role for a mixed starter edition", async () => {
  await withFixture(async ({ documents, set, invoke }) => {
    set.edition.partyStarter = { race: "dwarf", classSlug: "priest" };
    await writeFile(documents, JSON.stringify(set));
    const rejected = invoke();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Mixed-race\/class document sets require/);
    const accepted = invoke(["--role=party"]);
    assert.equal(accepted.status, 0, accepted.stderr);
  });
});

test("CLI fails closed for unsupported addon versions, arbitrary fields and malformed or oversized accounts", async () => {
  await withFixture(async ({ documents, set, invoke, output }) => {
    for (const changed of [
      { ...set, restedXpVersion: "v4.11.26" },
      { ...set, battleTag: "not-allowed" },
    ]) {
      await writeFile(documents, JSON.stringify(changed));
      const result = invoke();
      assert.notEqual(result.status, 0);
      await assert.rejects(stat(output), { code: "ENOENT" });
    }
    await writeFile(documents, JSON.stringify(set));
    for (const input of ["", "MalformedPrivateAccount", "x".repeat(257)]) {
      const result = invoke([], input);
      assert.notEqual(result.status, 0);
      assert(!result.stderr.includes("MalformedPrivateAccount"));
      await assert.rejects(stat(output), { code: "ENOENT" });
    }
    const unsafe = invoke(["--battle-tag=" + account]);
    assert.notEqual(unsafe.status, 0);
  });
});
