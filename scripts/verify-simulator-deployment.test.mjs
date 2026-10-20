import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { URL } from "node:url";
import { verifySimulatorDeployment } from "./verify-simulator-deployment.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(run, { profile = "warrior", slug = profile } = {}) {
  const artifactRoot = await mkdtemp(join(tmpdir(), "kfc-deployment-gate-"));
  const release = "a".repeat(24);
  const database = JSON.stringify({ items: [{ id: 18392, weaponSkills: [0, 0] }] });
  const publication = {
    profile,
    presentationRelease: release,
    builds: [{ id: "arms-alliance" }],
  };
  const documents = {
    "model-update.json": {
      schema: "kfc-simulator-model-update-selection.v1",
      release,
      sourceRelease: "b".repeat(24),
    },
    "published-reviews.json": {
      schema: "kfc-published-simulator-reviews.v1",
      profiles: {
        [profile]: {
          path: `published-reviews/${profile}-0123456789abcdef.json`,
          sha256: hash(JSON.stringify(publication)),
        },
      },
    },
    [`published-reviews/${profile}-0123456789abcdef.json`]: publication,
    [release + "/manifest.json"]: {
      release,
      itemCount: 1,
      itemWeaponSkillPolicy: { mode: "ignore-item-bonuses", changes: [{ id: 18392 }] },
      files: {
        "assets/database/db.json": { bytes: Buffer.byteLength(database), sha256: hash(database) },
      },
    },
  };
  await mkdir(join(artifactRoot, release));
  await mkdir(join(artifactRoot, "published-reviews"));
  for (const [path, document] of Object.entries(documents))
    await writeFile(join(artifactRoot, path), JSON.stringify(document));
  const responses = new Map([
    [
      `/tools/forever/simulator/${slug}`,
      {
        body: `<iframe src="/tools/forever-sim/${release}/${profile}/"></iframe><label>Choose a build</label><select><option value="arms-alliance">Arms</option></select>`,
        status: 200,
      },
    ],
    [`/tools/forever-sim/${release}/assets/database/db.json`, { body: database, status: 200 }],
  ]);
  const fetcher = async (url) => {
    const row = responses.get(new URL(url).pathname) ?? { body: null, status: 404 };
    return new globalThis.Response(row.body, { status: row.status });
  };
  try {
    await run({ artifactRoot, responses, documents, release, fetcher });
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
}

test("accepts only the published model, full build library and matching zero-skill database", async () => {
  await fixture(async ({ artifactRoot, fetcher }) => {
    const result = await verifySimulatorDeployment(
      { baseUrl: "https://helper.test/tools", artifactRoot },
      fetcher,
    );
    assert.equal(result.status, "passed");
    assert.deepEqual(result.profiles, [{ profile: "warrior", builds: 1 }]);
    assert.equal(result.items, 1);
    assert.equal(result.privateProofsHidden, true);
  });
});

test("checks canonical public slugs instead of internal underscored engine paths for other classes", async () => {
  for (const [profile, slug] of [
    ["feral_druid", "feral-druid"],
    ["balance_druid", "balance-druid"],
    ["shadow_priest", "shadow-priest"],
  ])
    await fixture(
      async ({ artifactRoot, fetcher }) => {
        const result = await verifySimulatorDeployment(
          { baseUrl: "https://helper.test/tools", artifactRoot },
          fetcher,
        );
        assert.deepEqual(result.profiles, [{ profile, builds: 1 }]);
      },
      { profile, slug },
    );
});

test("unknown profiles fail before treating an invented public path as a valid simulator", async () => {
  await fixture(
    async ({ artifactRoot, fetcher }) => {
      await assert.rejects(
        verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
        /Unknown simulator profile/,
      );
    },
    { profile: "unknown_class" },
  );
});

test("rejects the stale reader regression before activation", async () => {
  await fixture(async ({ artifactRoot, responses, fetcher }) => {
    responses.get("/tools/forever/simulator/warrior").body =
      '<iframe src="/tools/forever-sim/cccccccccccccccccccccccc/warrior/"></iframe>';
    await assert.rejects(
      verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
      /ignored the selected simulator model/,
    );
  });
});

test("rejects HTTP 200 pages with missing approved presets", async () => {
  await fixture(async ({ artifactRoot, responses, fetcher }) => {
    const row = responses.get("/tools/forever/simulator/warrior");
    row.body = row.body.replace('value="arms-alliance"', 'value="unapproved"');
    await assert.rejects(
      verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
      /missing build/,
    );
  });
});

test("rejects asset errors and changed public database bytes", async () => {
  for (const response of [
    { status: 500, body: "" },
    { status: 200, body: "{}" },
  ]) {
    await fixture(async ({ artifactRoot, responses, release, fetcher }) => {
      responses.set(`/tools/forever-sim/${release}/assets/database/db.json`, response);
      await assert.rejects(
        verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
        /Simulator request failed|database size mismatch/,
      );
    });
  }
});

test("rejects exposed private proofs", async () => {
  await fixture(async ({ artifactRoot, responses, release, fetcher }) => {
    responses.set(`/tools/forever-sim/${release}/kfc-reviewed-presets.json`, {
      status: 200,
      body: "{}",
    });
    await assert.rejects(
      verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
      /Private simulator proof exposed/,
    );
  });
});

test("rejects skill bonuses even when the served database matches its manifest", async () => {
  await fixture(async ({ artifactRoot, responses, documents, release, fetcher }) => {
    const body = JSON.stringify({ items: [{ id: 18392, weaponSkills: [0, 6] }] });
    responses.set(`/tools/forever-sim/${release}/assets/database/db.json`, { status: 200, body });
    const manifest = documents[release + "/manifest.json"];
    manifest.files["assets/database/db.json"] = {
      bytes: Buffer.byteLength(body),
      sha256: hash(body),
    };
    await writeFile(join(artifactRoot, release, "manifest.json"), JSON.stringify(manifest));
    await assert.rejects(
      verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
      /still grants item weapon skill/,
    );
  });
});

async function profileFixture(run) {
  await fixture(async (values) => {
    const { artifactRoot, documents, responses, release } = values;
    const profileRelease = "c".repeat(24);
    const publicationPath = "published-reviews/mage-0123456789abcdef.json";
    const publication = {
      profile: "mage",
      presentationRelease: profileRelease,
      builds: [{ id: "mage-frost-static" }],
    };
    const selection = {
      schema: "kfc-simulator-profile-model-selection.v1",
      profiles: { mage: { release: profileRelease, sourceRelease: "d".repeat(24) } },
    };
    documents["published-reviews.json"].profiles.mage = {
      path: publicationPath,
      sha256: hash(JSON.stringify(publication)),
    };
    await mkdir(join(artifactRoot, profileRelease));
    await writeFile(join(artifactRoot, publicationPath), JSON.stringify(publication));
    await writeFile(join(artifactRoot, "profile-model-updates.json"), JSON.stringify(selection));
    await writeFile(
      join(artifactRoot, "published-reviews.json"),
      JSON.stringify(documents["published-reviews.json"]),
    );
    await writeFile(
      join(artifactRoot, profileRelease, "manifest.json"),
      JSON.stringify({ ...documents[release + "/manifest.json"], release: profileRelease }),
    );
    responses.set("/tools/forever/simulator/mage", {
      status: 200,
      body: `<iframe src="/tools/forever-sim/${profileRelease}/mage/"></iframe><label>Choose a build</label><select><option value="mage-frost-static">Frost</option></select>`,
    });
    responses.set(`/tools/forever-sim/${profileRelease}/assets/database/db.json`, {
      ...responses.get(`/tools/forever-sim/${release}/assets/database/db.json`),
    });
    await run({ ...values, profileRelease, selection });
  });
}

test("verifies independent class releases without replacing the existing physical model", async () => {
  await profileFixture(async ({ artifactRoot, fetcher, release, profileRelease }) => {
    const result = await verifySimulatorDeployment(
      { baseUrl: "https://helper.test/tools", artifactRoot },
      fetcher,
    );
    assert.deepEqual(result.profileReleases, { warrior: release, mage: profileRelease });
    assert.deepEqual(result.databases, { [release]: 1, [profileRelease]: 1 });
  });
});

test("rejects a class-specific page that silently falls back to the global model", async () => {
  await profileFixture(async ({ artifactRoot, fetcher, responses, release }) => {
    responses.get("/tools/forever/simulator/mage").body =
      `<iframe src="/tools/forever-sim/${release}/mage/"></iframe><label>Choose a build</label>`;
    await assert.rejects(
      verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
      /ignored the selected simulator model/,
    );
  });
});

test("checks database bytes and proof privacy for every independently selected class", async () => {
  for (const failure of ["database", "proof"]) {
    await profileFixture(async ({ artifactRoot, fetcher, responses, profileRelease }) => {
      responses.set(
        `/tools/forever-sim/${profileRelease}/` +
          (failure === "database" ? "assets/database/db.json" : "kfc-reviewed-presets.json"),
        { status: 200, body: "{}" },
      );
      await assert.rejects(
        verifySimulatorDeployment({ baseUrl: "https://helper.test/tools", artifactRoot }, fetcher),
        /database size mismatch|Private simulator proof exposed/,
      );
    });
  }
});
