import { readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";

export const workspaceInputs = [
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
];

export function patchWorkspaceSource(source) {
  const imported = "import { installKfcWorkspace } from './kfc_workspace.js';\n";
  const marker =
    "\t\tthis.simTabContentsContainer = this.rootElem.querySelector('.sim-main.tab-content') as HTMLElement;";
  const hook = "\n\t\tthis.addOnDisposeCallback(installKfcWorkspace(this));";
  if (!source.includes(marker) || source.split(marker).length !== 2)
    throw new Error("Upstream simulator workspace constructor changed");
  const hasImport = source.includes(imported),
    hasHook = source.includes(hook);
  if (hasImport !== hasHook) throw new Error("Incomplete simulator workspace overlay");
  if (hasImport) return source;
  return imported + source.replace(marker, marker + hook);
}

export function patchGearSlotLabels(source) {
  const marker = "\t\tthis.itemElem = new ItemRenderer(parent, this.rootElem, player);";
  const addition = `
\t\tconst slotLabel = document.createElement('span');
\t\tslotLabel.className = 'kfc-slot-label';
\t\tslotLabel.textContent = slotNames.get(slot) ?? 'Equipment';
\t\tthis.itemElem.nameElem.parentElement!.prepend(slotLabel);
\t\tthis.itemElem.iconElem.setAttribute('aria-label', 'Change ' + slotLabel.textContent);
\t\tthis.itemElem.nameElem.setAttribute('aria-label', 'Change ' + slotLabel.textContent);
\t\tthis.itemElem.enchantElem.setAttribute('aria-label', 'Change enchant for ' + slotLabel.textContent);`;
  if (!source.includes(marker) || source.split(marker).length !== 2)
    throw new Error("Upstream equipment renderer changed");
  if (source.includes(addition)) return source;
  if (source.includes("'kfc-slot-label'")) throw new Error("Incomplete equipment label overlay");
  return source.replace(marker, marker + addition);
}

export function patchEmbeddedResultAction(source) {
  const original = "(window.opener || window.parent)!.postMessage('runOnce', '*');";
  const replacement = "window.postMessage('runOnce', window.location.origin);";
  if (source.includes(replacement) && !source.includes(original)) return source;
  if (source.split(original).length !== 2 || source.includes(replacement))
    throw new Error("Upstream embedded result action changed");
  return source.replace(original, replacement);
}

export function patchInitialBuild(source) {
  const markers = [
    "\t\t\tconst savedSettings = window.localStorage.getItem(this.getSettingsStorageKey());",
    "\t\t\t\t\tthis.fromProto(initEventID, settings);",
    "\t\t\t// This needs to go last so it doesn't re-store things as they are initialized.",
    "\t\t\t\tthis.loadSettings();",
    "\t\t\t// This needs to go before all the UI components so that gear loading is the",
  ];
  if (source.includes("kfc-starter-initialized-v1"))
    throw new Error("Starter overlay already applied");
  for (const marker of markers)
    if (source.split(marker).length !== 2)
      throw new Error("Upstream starter initialization changed");
  return source
    .replace(
      markers[0],
      markers[0] +
        `
\t\t\tconst starterKey = this.getSettingsStorageKey() + '_kfc-starter-initialized-v1';
\t\t\tconst firstStarterLoad = window.localStorage.getItem(starterKey) == null;`,
    )
    .replace(
      markers[1],
      markers[1] +
        `
\t\t\t\t\t// Older releases persisted an empty character over the usable defaults.
\t\t\t\t\tif (firstStarterLoad && !settings.player?.equipment?.items.some(item => item.id)) {
\t\t\t\t\t\twindow.localStorage.setItem(starterKey + '_backup', savedSettings);
\t\t\t\t\t\tconst starter = this.individualConfig.presets.gear.find(preset => preset.name.startsWith('Blue PvP starter') && (!preset.enableWhen || preset.enableWhen(this.player)));
\t\t\t\t\t\tthis.player.setGear(initEventID, this.sim.db.lookupEquipmentSpec(starter?.gear ?? this.individualConfig.defaults.gear));
\t\t\t\t\t\tstarter?.onLoad?.(this.player);
\t\t\t\t\t\tif (!settings.player?.talentsString) this.player.setTalentsString(initEventID, this.individualConfig.defaults.talents.talentsString);
\t\t\t\t\t}`,
    )
    .replace(
      markers[2],
      `\t\t\tif (firstStarterLoad) {
\t\t\t\twindow.localStorage.setItem(this.getSettingsStorageKey(), IndividualSimSettings.toJsonString(this.toProto()));
\t\t\t\twindow.localStorage.setItem(starterKey, '1');
\t\t\t}

` + markers[2],
    )
    .replace(markers[3], markers[3] + "\n\t\t\t\tthis.rootElem.dataset.kfcInitialized = 'true';")
    .replace(markers[4], "\t\t\tthis.rootElem.dataset.kfcInitialized = 'false';\n" + markers[4]);
}

export async function adaptWorkspaceSource(root) {
  const uiPath = join(root, "ui/core/sim_ui.tsx");
  const gearPath = join(root, "ui/core/components/gear_picker/gear_picker.tsx");
  const resultsPath = join(root, "ui/core/components/detailed_results.tsx");
  const individualPath = join(root, "ui/core/individual_sim_ui.ts");
  await writeFile(uiPath, patchWorkspaceSource(await readFile(uiPath, "utf8")));
  await writeFile(gearPath, patchGearSlotLabels(await readFile(gearPath, "utf8")));
  await writeFile(resultsPath, patchEmbeddedResultAction(await readFile(resultsPath, "utf8")));
  await writeFile(individualPath, patchInitialBuild(await readFile(individualPath, "utf8")));
  await copyFile(
    new URL("./workspace.ts", import.meta.url),
    join(root, "ui/core/kfc_workspace.ts"),
  );
}

export async function hostWorkspaceAssets(root) {
  await writeFile(
    join(root, "kfc-workspace.css"),
    (await readFile(new URL("./workspace.css", import.meta.url), "utf8")) +
      "\n" +
      (await readFile(new URL("./inspection.css", import.meta.url), "utf8")),
  );
}

export function linkWorkspaceStyles(html, base) {
  if (!html.includes("</head>")) throw new Error("Simulator page has no head element");
  if (html.includes('data-kfc-workspace="v1"')) return html;
  return html.replace(
    "</head>",
    `<link rel="stylesheet" href="${base}kfc-workspace.css" data-kfc-workspace="v1">\n</head>`,
  );
}
