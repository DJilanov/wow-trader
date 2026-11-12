import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readCatalogClientInstallation } from "./catalog-client.mjs";

async function fixture(context, rows, flavors) {
  const root = await mkdtemp(join(tmpdir(), "catalog-client-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, ".build.info"),
    "Product!STRING:0|Version!STRING:0|Active!DEC:1\n" + rows.join("\n") + "\n",
  );
  for (const [directory, product] of Object.entries(flavors)) {
    await mkdir(join(root, directory));
    await writeFile(
      join(root, directory, ".flavor.info"),
      "Product Flavor!STRING:0\n" + product + "\n",
    );
  }
  return root;
}

test("Forever launch uses wowf files while the catalog retains its stable key", async (context) => {
  const root = await fixture(context, ["wowf|1.60.1.70790|1"], { _forever_: "wowf" });
  assert.deepEqual(await readCatalogClientInstallation(root, "wow_classic_beta"), {
    clientProduct: "wowf",
    version: "1.60.1.70790",
    buildNumber: 70790,
    productRoot: join(root, "_forever_"),
  });
  assert.equal((await readCatalogClientInstallation(root, "wowf")).clientProduct, "wowf");
});

test("beta and TBC installations remain supported independently", async (context) => {
  const root = await fixture(
    context,
    ["wow_classic_beta|1.60.1.70532|1", "wow_anniversary|2.5.6.70577|1"],
    {
      _classic_beta_: "wow_classic_beta",
      _anniversary_: "wow_anniversary",
    },
  );
  assert.equal((await readCatalogClientInstallation(root, "wow_classic_beta")).buildNumber, 70532);
  assert.equal((await readCatalogClientInstallation(root, "wow_anniversary")).buildNumber, 70577);
});

test("active launch supersedes an installed beta; inactive launch does not", async (context) => {
  const root = await fixture(context, ["wow_classic_beta|1.60.1.70532|1", "wowf|1.60.1.70790|1"], {
    _classic_beta_: "wow_classic_beta",
    _forever_: "wowf",
  });
  assert.equal((await readCatalogClientInstallation(root, "wow_classic_beta")).buildNumber, 70790);
  await writeFile(
    join(root, ".build.info"),
    "Product|Version|Active\nwow_classic_beta|1.60.1.70532|1\nwowf|1.60.1.70790|0\n",
  );
  assert.equal((await readCatalogClientInstallation(root, "wow_classic_beta")).buildNumber, 70532);
});

test("duplicate active builds fail instead of selecting arbitrary data", async (context) => {
  const root = await fixture(context, ["wowf|1.60.1.70790|1", "wowf|1.60.1.70791|1"], {
    _forever_: "wowf",
  });
  await assert.rejects(readCatalogClientInstallation(root, "wow_classic_beta"), /found 2/);
});

test("missing or ambiguous client directories fail closed", async (context) => {
  const root = await fixture(context, ["wowf|1.60.1.70790|1"], {});
  await assert.rejects(
    readCatalogClientInstallation(root, "wow_classic_beta"),
    /directory, found 0/,
  );
  for (const directory of ["_forever_", "copy"]) {
    await mkdir(join(root, directory));
    await writeFile(join(root, directory, ".flavor.info"), "Product\nwowf\n");
  }
  await assert.rejects(
    readCatalogClientInstallation(root, "wow_classic_beta"),
    /directory, found 2/,
  );
});

test("bad headers, versions and absent requested products fail closed", async (context) => {
  const root = await fixture(context, ["wowf|invalid|1"], { _forever_: "wowf" });
  await assert.rejects(readCatalogClientInstallation(root, "wow_classic_beta"), /invalid version/);
  await assert.rejects(readCatalogClientInstallation(root, "wow_anniversary"), /found 0/);
  await writeFile(join(root, ".build.info"), "bad headers\n");
  await assert.rejects(
    readCatalogClientInstallation(root, "wow_classic_beta"),
    /unsupported format/,
  );
});
