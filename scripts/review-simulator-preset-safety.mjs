import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { inflateSync } from "node:zlib";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";
import { loadSimulatorBuildSettingsCodec } from "../artifacts/forever-simulator/optimization/review-tools/simulator-build-settings-codec.mjs";
import { assertProcConsentDisabled } from "./review-prebis-browser.mjs";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";

assert(
  [3, 4, 5].includes(process.argv.length) &&
    /^--release=[a-f0-9]{24}$/.test(process.argv[2]) &&
    process.argv
      .slice(3)
      .every(
        (arg) =>
          arg === "--model-update" ||
          /^--publication-plan=optimization\/[a-z0-9-]+\/publication-plan-[a-f0-9]{24}\.json$/.test(
            arg,
          ),
      ) &&
    new Set(process.argv.slice(3)).size === process.argv.slice(3).length,
);
const modelUpdate = process.argv.slice(3).includes("--model-update");
const planArgument = process.argv.slice(3).find((arg) => arg.startsWith("--publication-plan="));
assert(
  !planArgument || modelUpdate,
  "An additive publication plan requires the model-update review",
);
const root = resolve(import.meta.dirname, ".."),
  storage = join(root, "artifacts/forever-simulator");
const release = process.argv[2].slice(10);
const read = async (path) => JSON.parse(await readFile(join(storage, path), "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = await read(release + "/manifest.json"),
  report = await read(release + "/kfc-preset-safety.json");
const reportSha256 = sha(await readFile(join(storage, release, "kfc-preset-safety.json")));
assert.equal(reportSha256, manifest.files["kfc-preset-safety.json"].sha256);
const source = await read(report.sourceRelease + "/manifest.json");
const modelProof = modelUpdate ? await read(release + "/kfc-reviewed-presets.json") : null;
const publicationPlan = modelUpdate
  ? await read(
      planArgument?.slice("--publication-plan=".length) ??
        "optimization/item-skill-revalidation-v1/publication-plan.json",
    )
  : null;
if (modelUpdate) {
  assert(
    ["kfc-simulator-item-skill-update.v1", "kfc-simulator-model-update-with-builds.v1"].includes(
      modelProof.schema,
    ),
  );
  if (modelProof.schema === "kfc-simulator-model-update-with-builds.v1") assert(planArgument);
  assert.equal(publicationPlan.release, release);
  assert.equal(publicationPlan.sourceRelease, source.release);
  assert.equal(publicationPlan.proofSha256, manifest.files["kfc-reviewed-presets.json"].sha256);
  for (const [name, metadata] of Object.entries(manifest.files)) {
    const bytes = await readFile(join(storage, release, name));
    assert.equal(bytes.length, metadata.bytes, "Asset size changed: " + name);
    assert.equal(sha(bytes), metadata.sha256, "Asset hash changed: " + name);
  }
  const db = await read(release + "/assets/database/db.json");
  assert(
    db.items.every((item) => !item.weaponSkills?.some((value) => value !== 0)),
    "Item skills still present in browser data",
  );
}
const presetMetadata = await read(release + "/kfc-default-enchants.json");
const tankMetadata = await read(release + "/kfc-tank-starters.json");
for (const preset of presetMetadata.presets) {
  const row = report.repairs.find(
    (row) => row.profile === preset.profile && row.variant === preset.variant,
  );
  assert.deepEqual(preset.gear, row.gear, "Preset summaries and delivered equipment disagree");
  for (const [field, slots] of [
    ["rings", [10, 11]],
    ["trinkets", [12, 13]],
  ])
    assert.deepEqual(
      preset[field].map((item) => item.itemId),
      slots.map((slot) => preset.gear.items[slot].id),
    );
  if (tankMetadata[preset.profile]) {
    assert.deepEqual(tankMetadata[preset.profile].enchantTotals, preset.enchantTotals);
    assert.equal(tankMetadata[preset.profile].enchantCount, preset.choices.length);
  }
}
for (const [name, metadata] of Object.entries(report.modelAssets)) {
  assert.deepEqual(metadata, source.files[name]);
  assert.deepEqual(metadata, manifest.files[name]);
  const bytes = await readFile(join(storage, release, name));
  assert.equal(sha(bytes), metadata.sha256);
}
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const codec = await loadSimulatorBuildSettingsCodec(root);
const esbuild = require("esbuild");
let compiled;
try {
  compiled = await esbuild.build({
    stdin: {
      contents: "export {IndividualSimSettings} from './ui/core/proto/ui';",
      resolveDir: join(root, ".cache/forever-sim-upstream"),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
} finally {
  esbuild.stop();
}
const api = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64")
);
const pointers = modelUpdate
    ? { profiles: publicationPlan.profiles }
    : await read("published-reviews.json"),
  publications = {};
for (const profile of Object.keys(modelUpdate ? publicationPlan.profiles : report.parents)) {
  const ref = pointers.profiles[profile];
  const pub = await read(ref.path);
  assert.equal(sha(JSON.stringify(pub)), ref.sha256);
  assert.equal(pub.presentationRelease, modelUpdate ? release : report.parents[profile]);
  publications[profile] = pub;
}
const normalizeGear = (gear) => gear.items.map((s) => ({ id: s.id ?? 0, enchant: s.enchant ?? 0 }));
const profiles = [...new Set(report.repairs.map((row) => row.profile))];
const server = await startSimulatorLocalServer(storage, manifest);
const browser = await require("playwright").chromium.launch();
const errors = [],
  checks = [],
  shares = [];
let nativeWorkers;
const parityChecks = [];
const blockedItems = new Set(report.blockedItems.map((x) => x.id));
const blockedEnchants = new Set(report.blockedEnchants.map((x) => x.type + ":" + x.id));
const slotTypes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14];
async function saved(page) {
  return page.evaluate(() => {
    const keys = Object.keys(globalThis.localStorage).filter((k) =>
      k.endsWith("__currentSettings__"),
    );
    if (keys.length !== 1) throw new Error("Expected isolated character");
    return { key: keys[0], settings: JSON.parse(globalThis.localStorage[keys[0]]) };
  });
}
async function ready(page) {
  await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 90000 });
}
function safeGear(gear) {
  for (const [slot, item] of gear.items.entries()) {
    assert(!blockedItems.has(item.id), "Unsafe preset item " + item.id);
    assert(
      !blockedEnchants.has(slotTypes[slot] + ":" + item.enchant),
      "Unsafe preset enchant " + item.enchant,
    );
  }
}
async function open(profile, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(profile + ": " + e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(server.origin))
      errors.push("HTTP " + r.status() + ": " + r.url());
  });
  await page.addInitScript(() => {
    if (!["http:", "https:"].includes(globalThis.location.protocol)) return;
    globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
    globalThis.__kfcPresetCombatRequests = 0;
    const post = globalThis.Worker.prototype.postMessage;
    globalThis.Worker.prototype.postMessage = function (m, ...args) {
      if (["raidSim", "raidSimAsync"].includes(m.msg)) globalThis.__kfcPresetCombatRequests++;
      return post.call(this, m, ...args);
    };
  });
  assert((await page.goto(`${server.origin}/forever-sim/${release}/${profile}/`))?.ok());
  await ready(page);
  return { context, page };
}
try {
  for (const profile of profiles) {
    const { context, page } = await open(profile, { width: 1440, height: 1080 });
    let current = await saved(page);
    safeGear(current.settings.player.equipment);
    if (modelUpdate)
      assert(
        report.repairs.some(
          (row) =>
            row.profile === profile &&
            JSON.stringify(normalizeGear(row.gear)) ===
              JSON.stringify(normalizeGear(current.settings.player.equipment)),
        ),
        `Unexpected ${profile} first-visit default`,
      );
    assert.equal(await page.locator(".kfc-preset-acquisition-warning:visible").count(), 0);
    const presets = page
      .locator(".saved-data-manager-root")
      .filter({ hasText: /^Gear Sets/ })
      .locator(".saved-data-presets .saved-data-set-name");
    const names = await presets.allTextContents();
    assert(names.length > 0, `No ${profile} gear sets`);
    const loaded = [];
    for (const name of names) {
      const target = page
        .locator(".saved-data-manager-root")
        .filter({ hasText: /^Gear Sets/ })
        .getByText(name, { exact: true });
      if (
        await target.evaluate((e) =>
          e.closest(".saved-data-set-chip").classList.contains("disabled"),
        )
      ) {
        const race =
          profile === "feral_tank_druid"
            ? name.includes("Horde")
              ? "Tauren"
              : "Night Elf"
            : name.includes("Horde")
              ? "Orc"
              : "Human";
        await page.locator("#player-race").selectOption({ label: race }, { force: true });
      }
      assert.equal(
        await target.evaluate((e) =>
          e.closest(".saved-data-set-chip").classList.contains("disabled"),
        ),
        false,
      );
      await target.click();
      current = await saved(page);
      safeGear(current.settings.player.equipment);
      loaded.push({ name, gear: normalizeGear(current.settings.player.equipment) });
    }
    for (const row of report.repairs.filter((r) => r.profile === profile))
      assert(
        loaded.some((x) => JSON.stringify(x.gear) === JSON.stringify(normalizeGear(row.gear))),
        `Gear menu missed ${profile}/${row.variant}`,
      );
    const configurations = page.locator(".preset-configuration-picker-root:visible").first();
    const configNames = await configurations.locator(".saved-data-set-name").allTextContents();
    const configuredGear = [];
    const configuredStates = [];
    for (const name of configNames) {
      await configurations.getByText(name, { exact: true }).click();
      current = await saved(page);
      safeGear(current.settings.player.equipment);
      configuredGear.push(normalizeGear(current.settings.player.equipment));
      configuredStates.push({ name, settings: current.settings });
    }
    const preservedStarter =
      profile === "hunter"
        ? modelProof?.virtualSourceFiles.find(
            (file) => file.path === "ui/hunter/gear_sets/forever_pet_melee_starter.gear.json",
          )
        : null;
    if (preservedStarter) {
      const petMelee = configuredStates.find(
        (entry) => entry.name === "Pet/Melee · pre-raid starter",
      );
      assert(petMelee, "Missing separately preserved Pet/Melee starter configuration");
      const items = petMelee.settings.player.equipment.items;
      assert.equal(items.length, 17);
      assert(items.every((item) => Number.isSafeInteger(item.id) && item.id > 0));
      const canonical = {
        items: items.map((item) => ({
          id: item.id,
          ...(item.enchant ? { enchant: item.enchant } : {}),
        })),
      };
      assert.equal(
        sha(JSON.stringify(canonical, null, 2) + "\n"),
        preservedStarter.sha256,
        "Actual Pet/Melee configuration no longer matches its frozen safe starter gear",
      );
    }
    if (modelUpdate && publications[profile])
      for (const build of publications[profile].builds.filter(
        (entry) => !entry.requiresProvisionalEnchantOptIn,
      )) {
        const settings = api.IndividualSimSettings.toJson(
          api.IndividualSimSettings.fromBinary(
            inflateSync(
              Buffer.from(new URL(build.href, "https://helper.invalid").hash.slice(1), "base64"),
            ),
          ),
        );
        const expectedGear = JSON.stringify(normalizeGear(settings.player.equipment));
        assert(
          loaded.some((row) => JSON.stringify(row.gear) === expectedGear),
          `Gear Sets missed corrected ${build.id}`,
        );
        assert(
          configuredGear.some((gear) => JSON.stringify(gear) === expectedGear),
          `Configurations missed corrected ${build.id}`,
        );
        if (modelProof.firstPassBuilds?.some((entry) => entry.id === build.id)) {
          const actual = configuredStates.find((entry) => entry.name === build.displayName);
          assert(actual, `Missing exact first-pass configuration ${build.id}`);
          for (const field of [
            "equipment",
            "talentsString",
            "rotation",
            "consumes",
            profile === "feral_druid"
              ? "feralDruid"
              : profile === "balance_druid"
                ? "balanceDruid"
                : "hunter",
            "distanceFromTarget",
            "foreverTier1Bonuses",
            "enableItemSwap",
          ])
            assert.deepEqual(
              actual.settings.player[field],
              settings.player[field],
              `First-pass configuration ${build.id} changed ${field}`,
            );
        }
      }
    assert.equal(await page.evaluate(() => globalThis.__kfcPresetCombatRequests), 0);
    checks.push({
      profile,
      gearSets: loaded.length,
      configurations: configNames.length,
      firstVisitSafe: true,
      ...(preservedStarter ? { preservedPetMeleeStarter: true } : {}),
    });
    console.log(
      "[preset-review] " +
        profile +
        ": " +
        loaded.length +
        " gear sets, " +
        configNames.length +
        " configurations passed",
    );
    await context.close();
  }
  for (const viewport of [
    { width: 1440, height: 1080 },
    { width: 390, height: 844 },
  ])
    for (const [profile, pub] of Object.entries(publications)) {
      const { context, page } = await open(profile, viewport);
      for (const build of pub.builds) {
        const expected = api.IndividualSimSettings.toJson(
          api.IndividualSimSettings.fromBinary(
            inflateSync(
              Buffer.from(new URL(build.href, "https://helper.invalid").hash.slice(1), "base64"),
            ),
          ),
        );
        const hash = new URL(build.href, "https://helper.invalid").hash;
        // Hash-only navigation does not reconstruct the engine or import its share.
        await page.goto("about:blank");
        await page.goto(`${server.origin}/forever-sim/${release}/${profile}/${hash}`);
        await ready(page);
        assert.deepEqual(codec.normalize((await saved(page)).settings), codec.normalize(expected));
        safeGear((await saved(page)).settings.player.equipment);
        assert.equal(await page.locator(".kfc-preset-acquisition-warning:visible").count(), 0);
        await assertProcConsentDisabled(page);
        shares.push({ profile, id: build.id, viewport, fullMeasuredSettingsPreserved: true });
      }
      await context.close();
      console.log(`[preset-review] ${profile}: full shares preserved at ${viewport.width}px`);
    }
  const { context, page } = await open("rogue", { width: 1440, height: 1080 });
  const original = await saved(page);
  original.settings.player.equipment.items[0] = { id: 19999, enchant: 1508 };
  await page.evaluate(
    ({ key, settings }) => globalThis.localStorage.setItem(key, JSON.stringify(settings)),
    original,
  );
  await page.reload();
  await ready(page);
  assert.equal((await saved(page)).settings.player.equipment.items[0].id, 19999);
  await page.locator(".kfc-preset-acquisition-warning:visible").waitFor();
  const sets = page.locator(".saved-data-manager-root").filter({ hasText: /^Gear Sets/ });
  await sets.locator(".saved-data-presets .saved-data-set-name").first().click();
  await page.locator(".kfc-preset-acquisition-warning:visible").waitFor({ state: "hidden" });
  safeGear((await saved(page)).settings.player.equipment);
  await context.close();
  assert.deepEqual(errors, []);
  if (modelUpdate) {
    const study = join(storage, "optimization/item-skill-revalidation-v1");
    nativeWorkers = await openNativeRunners(
      join(study, "kfc-prebis"),
      join(root, ".cache/forever-sim-upstream"),
      modelProof.nativeBinarySha256,
      1,
    );
    for (const [profile, publication] of Object.entries(publications))
      for (const build of publication.builds) {
        const settings = api.IndividualSimSettings.toJson(
          api.IndividualSimSettings.fromBinary(
            inflateSync(
              Buffer.from(new URL(build.href, "https://helper.invalid").hash.slice(1), "base64"),
            ),
          ),
        );
        const captured = await captureSimulatorRequest(root, settings, {
          release,
          profile,
          iterations: 25,
          seed: 819700001,
          allowProvisionalEnchants: build.requiresProvisionalEnchantOptIn,
          origin: server.origin,
        });
        const result = await nativeWorkers[0].run({
          id: build.id + "-delivery-parity",
          requestBase64: captured.requestBase64,
          gear: settings.player.equipment.items,
          talentsString: settings.player.talentsString,
          rotation: settings.player.rotation,
          iterations: 25,
          seed: 819700001,
        });
        assert(
          Math.abs(result.dps - captured.browserDps) <= 0.011,
          `Corrected native/browser delivery mismatch: ${build.id}`,
        );
        parityChecks.push({
          id: build.id,
          iterations: 25,
          seed: 819700001,
          nativeDps: result.dps,
          browserDps: captured.browserDps,
        });
        console.log(
          JSON.stringify({ status: "corrected-delivery-parity-passed", ...parityChecks.at(-1) }),
        );
      }
    const proofSha256 = manifest.files["kfc-reviewed-presets.json"].sha256;
    const approval = {
      schema: "kfc-item-skill-update-browser.v1",
      status: "passed",
      capturedAt: new Date().toISOString(),
      sourceRelease: source.release,
      release,
      proofSha256,
      checked: {
        allPresets: true,
        reviewedShares: true,
        firstVisitDefault: true,
        savedCharacterPreserved: true,
        provisionalConsentOff: true,
        nativeBrowserParity: true,
        desktopMobile: true,
        itemSkillsIgnored: true,
        assetIntegrity: true,
      },
      evidence: { checks, shares, parityChecks, assetCount: Object.keys(manifest.files).length },
      errors,
    };
    const digest = sha(JSON.stringify(approval));
    const path = `optimization/reviews/item-skills-browser-${digest.slice(0, 16)}.json`;
    await mkdir(join(storage, "optimization/reviews"), { recursive: true });
    await writeFile(join(storage, path), JSON.stringify(approval, null, 2) + "\n", { flag: "wx" });
    const pointer = {
      schema: "kfc-simulator-model-update-selection.v1",
      sourceRelease: source.release,
      release,
      proofSha256,
      browserReview: { path, sha256: digest },
    };
    for (const [name, value] of [
      [
        "published-reviews.json",
        { schema: "kfc-published-simulator-reviews.v1", profiles: publicationPlan.profiles },
      ],
      ["model-update.json", pointer],
    ]) {
      const temporary = join(storage, `${name}.${process.pid}.tmp`);
      await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
      await rename(temporary, join(storage, name));
    }
    console.log(
      JSON.stringify({
        status: "corrected-model-approved-selected-locally",
        release,
        approval: path,
        profiles: checks.length,
        reviewedShares: shares.length,
        parityChecks: parityChecks.length,
      }),
    );
  } else {
    const approval = {
      schema: "kfc-preset-safety-browser.v1",
      status: "passed",
      release,
      reportSha256,
      capturedAt: new Date().toISOString(),
      checked: {
        allPresets: true,
        reviewedShares: true,
        firstVisitDefault: true,
        savedCharacterPreserved: true,
        modelAssetsUnchanged: true,
        desktopMobile: true,
      },
      checks,
      shares,
      errors,
    };
    const digest = sha(JSON.stringify(approval)),
      path = `optimization/reviews/preset-safety-browser-${digest.slice(0, 16)}.json`;
    await mkdir(join(storage, "optimization/reviews"), { recursive: true });
    await writeFile(join(storage, path), JSON.stringify(approval, null, 2) + "\n", { flag: "wx" });
    const pointer = {
      schema: "kfc-simulator-preset-safety-selection.v1",
      sourceRelease: report.sourceRelease,
      release,
      reportSha256,
      parents: report.parents,
      browserReview: { path, sha256: digest },
    };
    const temporary = join(storage, `preset-safety.${process.pid}.tmp`);
    await writeFile(temporary, JSON.stringify(pointer, null, 2) + "\n", { flag: "wx" });
    await rename(temporary, join(storage, "preset-safety.json"));
    console.log(
      JSON.stringify({
        status: "all-preset-browser-review-passed-selected-locally",
        release,
        approval: path,
        profiles: checks.length,
        reviewedShares: shares.length,
      }),
    );
  }
} finally {
  nativeWorkers?.forEach((worker) => worker.close());
  await browser.close();
  await server.close();
}
