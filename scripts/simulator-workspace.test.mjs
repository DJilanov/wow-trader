import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import {
  linkWorkspaceStyles,
  patchGearSlotLabels,
  patchWorkspaceSource,
  patchEmbeddedResultAction,
  patchInitialBuild,
  workspaceInputs,
} from "../infra/simulator/workspace-adapter.mjs";

test("starter recovery backs up legacy empty gear once, before shared links override defaults", () => {
  const original =
    "\t\t\tconst savedSettings = window.localStorage.getItem(this.getSettingsStorageKey());\n\t\t\t\t\tthis.fromProto(initEventID, settings);\nloadFromSharedLink();\n\t\t\t// This needs to go last so it doesn't re-store things as they are initialized.\n\t\t\t\tthis.loadSettings();\n\t\t\t// This needs to go before all the UI components so that gear loading is the";
  const patched = patchInitialBuild(original);
  assert(
    patched.includes(
      "firstStarterLoad && !settings.player?.equipment?.items.some(item => item.id)",
    ),
  );
  assert(patched.indexOf("starterKey + '_backup'") < patched.indexOf("this.player.setGear"));
  assert(patched.indexOf("this.player.setGear") < patched.indexOf("loadFromSharedLink"));
  assert(patched.includes("dataset.kfcInitialized = 'true'"));
  assert(patched.includes("starter?.onLoad?.(this.player)"));
  assert.throws(() => patchInitialBuild("changed"), /changed/);
});

const constructorMarker =
  "\t\tthis.simTabContentsContainer = this.rootElem.querySelector('.sim-main.tab-content') as HTMLElement;";
const gearMarker = "\t\tthis.itemElem = new ItemRenderer(parent, this.rootElem, player);";

test("shared workspace overlay is idempotent and retains original source", () => {
  const original = `existing imports\nconstructor\n${constructorMarker}\nexisting behavior`;
  const patched = patchWorkspaceSource(original);
  assert(patched.includes(original.slice(0, original.indexOf(constructorMarker))));
  assert(patched.endsWith("existing behavior"));
  assert.equal(patchWorkspaceSource(patched), patched);
  assert.equal(patched.match(/installKfcWorkspace\(this\)/g).length, 1);
});

test("shared workspace overlay rejects changed, duplicate or partially applied constructors", () => {
  assert.throws(() => patchWorkspaceSource("unknown source"), /constructor changed/);
  assert.throws(
    () => patchWorkspaceSource(constructorMarker + constructorMarker),
    /constructor changed/,
  );
  assert.throws(
    () =>
      patchWorkspaceSource(
        "import { installKfcWorkspace } from './kfc_workspace.js';\n" + constructorMarker,
      ),
    /Incomplete/,
  );
});

test("equipment labels use existing slot data without replacing item handlers", () => {
  const source = gearMarker + "\nexisting equipment updates";
  const patched = patchGearSlotLabels(source);
  assert(patched.includes("slotNames.get(slot)"));
  assert(patched.includes("aria-label"));
  assert(patched.endsWith("existing equipment updates"));
  assert.equal(patchGearSlotLabels(patched), patched);
  assert.throws(() => patchGearSlotLabels("unknown renderer"), /renderer changed/);
  assert.throws(() => patchGearSlotLabels(gearMarker + "'kfc-slot-label'"), /Incomplete/);
});

test("workspace stylesheet loads after upstream styles under the immutable release", () => {
  const html = '<head><link rel="stylesheet" href="old.css"></head><body>content</body>';
  const result = linkWorkspaceStyles(html, "/forever-sim/aaaaaaaaaaaaaaaaaaaaaaaa/");
  assert(result.indexOf("kfc-workspace.css") > result.indexOf("old.css"));
  assert(result.includes('href="/forever-sim/aaaaaaaaaaaaaaaaaaaaaaaa/kfc-workspace.css"'));
  assert.equal(linkWorkspaceStyles(result, "/forever-sim/aaaaaaaaaaaaaaaaaaaaaaaa/"), result);
  assert.throws(() => linkWorkspaceStyles("not a document", "/"), /head element/);
});

test("embedded result reruns target this simulator, not the enclosing website", () => {
  const source = "before\n(window.opener || window.parent)!.postMessage('runOnce', '*');\nafter";
  const patched = patchEmbeddedResultAction(source);
  assert(patched.includes("window.postMessage('runOnce', window.location.origin)"));
  assert.equal(patchEmbeddedResultAction(patched), patched);
  assert.throws(() => patchEmbeddedResultAction("unknown source"), /action changed/);
});

test("release identity includes every workspace source file", async () => {
  assert.deepEqual(workspaceInputs, [
    "workspace-adapter.mjs",
    "workspace.ts",
    "workspace.css",
    "tank-starters-adapter.mjs",
    "verified-accessories.mjs",
    "tank-starter-sets.go",
    "tank-starter-sets_test.go",
    "inspection-data.mjs",
    "equipment-ownership.mjs",
    "inspection-adapter.mjs",
    "inspection.ts",
    "inspection.css",
    "enchant-validation.go",
    "enchant-validation_test.go",
    "default-enchants.mjs",
    "default-trinkets.mjs",
    "default-rings.mjs",
    "classic-accessory-worklist.json",
    "classic-prebis-reference.json",
    "classic-prebis-equipment.json",
    "classic-acquisition.mjs",
    "prebis-pool.mjs",
    "prebis-runner.go",
    "item-effects-adapter.mjs",
    "item-weapon-skills.mjs",
    "item-weapon-skills_test.go",
    "flame-wrath_test.go",
    "manual-crowd-pummeler.mjs",
    "manual-crowd-pummeler.go",
    "manual-crowd-pummeler_test.go",
    "drakkisath-trinkets.mjs",
    "drakkisath-trinkets.go",
    "drakkisath-trinkets_test.go",
    "dungeon-set-mana-adapter.mjs",
    "dungeon-set-mana.go",
    "dungeon-set-mana_test.go",
    "current-prebis-admission.mjs",
    "current-prebis-recovery.mjs",
    "current-prebis-staging.mjs",
    "current-prebis-equipment.json",
  ]);
  for (const file of workspaceInputs)
    assert((await readFile(new URL(`../infra/simulator/${file}`, import.meta.url))).length > 0);
  const builder = await readFile(
    new URL("./prepare-forever-simulator.mjs", import.meta.url),
    "utf8",
  );
  assert(builder.includes("builder, ...workspace"));
  assert(builder.includes("Simulator inputs changed during build; retry after editing"));
});

test("KFC fonts are self-hosted, hash-pinned and accompanied by their licenses", async () => {
  const vendors = JSON.parse(
    await readFile(new URL("../infra/simulator/vendors.json", import.meta.url), "utf8"),
  );
  const styles = await readFile(
    new URL("../infra/simulator/workspace.css", import.meta.url),
    "utf8",
  );
  for (const name of ["cinzel", "inter", "mono"]) {
    assert(styles.includes(`vendor/fonts/${name}.woff2`));
    for (const suffix of [".woff2", "-OFL.txt"]) {
      const asset = vendors.find((vendor) => vendor.path === `vendor/fonts/${name}${suffix}`);
      assert(asset);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert(!styles.includes("https://"));
});

test("import/export controls stay inside their owning component and use explicit clicks", async () => {
  const source = await readFile(
    new URL("../infra/simulator/workspace.ts", import.meta.url),
    "utf8",
  );
  assert(source.includes("ui.simHeader.rootElem.append(utilities)"));
  assert(source.includes('toggle.dataset.bsTrigger = "click"'));
  assert(source.includes("resultsObserver.disconnect()"));
  assert(source.includes("resizeObserver.disconnect()"));
  assert(source.includes("rulesetListener.dispose()"));
});

test("embedded picker dismissal accepts only its same-origin parent and disposes the listener", async () => {
  const source = await readFile(
    new URL("../infra/simulator/workspace.ts", import.meta.url),
    "utf8",
  );
  assert(source.includes("event.origin !== window.location.origin"));
  assert(source.includes("event.source !== window.parent"));
  assert(source.includes('event.data.type !== "kfc-simulator-dismiss-item-picker"'));
  assert(source.includes('window.removeEventListener("message", dismissItemPicker)'));
});

test("the workspace omits the tools menu and outbound links but preserves simulation options", async () => {
  const source = await readFile(
    new URL("../infra/simulator/workspace.ts", import.meta.url),
    "utf8",
  );
  assert(!source.includes("Model & tools"));
  assert(!source.includes('element("a"'));
  assert(source.includes('options.setAttribute("aria-label", "Simulation options")'));
  assert(source.includes('required(root, ".sim-toolbar").remove()'));
});

test("only successful engine results notify the host, with no build data and safe disposal", async () => {
  const source = await readFile(
    new URL("../infra/simulator/workspace.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const sent = [];
  const host = { postMessage: (...args) => sent.push(args) };
  const window = { parent: host, location: { origin: "https://kfcguild.online" } };
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    window,
    require: (path) => {
      assert(
        ["./kfc_tank_starters.json", "./kfc_prebis_import.json", "./kfc_inspection.js"].includes(
          path,
        ),
      );
      return {};
    },
  };
  vm.runInNewContext(compiled, context);
  let complete;
  const sim = {
    simResultEmitter: {
      on: (listener) => {
        complete = listener;
        return {
          dispose: () => {
            complete = null;
          },
        };
      },
    },
  };
  const dispose = module.exports.installKfcSimulationMeasurement(sim);
  assert.equal(sent.length, 0);
  complete(123, { request: { player: "private" }, result: { damage: 100 } });
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    [{ type: "kfc-simulation-completed", version: 1 }, "https://kfcguild.online"],
  ]);
  host.postMessage = () => {
    throw new Error("host unavailable");
  };
  assert.doesNotThrow(() => complete());
  dispose();
  assert.equal(complete, null);
  window.parent = window;
  const disposeStandalone = module.exports.installKfcSimulationMeasurement(sim);
  assert.doesNotThrow(() => complete());
  assert.equal(sent.length, 1);
  disposeStandalone();
});
