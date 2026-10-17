import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";

function replace(source, original, replacement) {
  if (replacement && source.includes(replacement)) return source;
  if (!replacement && !source.includes(original)) return source;
  if (source.split(original).length !== 2)
    throw new Error(`Simulator inspection contract changed: ${original.slice(0, 85)}`);
  return source.replace(original, replacement);
}

export function patchInspectionSource(file, source) {
  if (file === "gear") {
    source = source.replace(
      "{ enchant: this.inspectedItem.enchant, player: this.player }",
      "{ enchant: this.inspectedItem.enchant, item: this.inspectedItem, player: this.player }",
    );
    source = replace(
      source,
      "(elem as HTMLElement & { _tippy?: { destroy: () => void } })._tippy?.destroy();",
      "if (!elem.dataset.kfcInspect) (elem as HTMLElement & { _tippy?: { destroy: () => void } })._tippy?.destroy();",
    );
    source = source.replace(
      "const choices = this.player.sim.db.getEnchants(this.slot);",
      "const choices = newItem ? this.player.sim.db?.getEnchants(this.slot) ?? [] : [];",
    );
    source = replace(
      source,
      "import { ref } from 'tsx-vanilla';",
      "import { ref } from 'tsx-vanilla';\nimport { bindInspection, addItemDetails, enchantSummary } from '../../kfc_inspection.js';\nimport { enchantAppliesToItem } from '../../proto_utils/utils.js';",
    );
    source = replace(
      source,
      "readonly enchantElem: HTMLAnchorElement;",
      "private inspectedItem: EquippedItem | null = null;\n\treadonly enchantElem: HTMLButtonElement;",
    );
    source = replace(
      source,
      "const enchantElem = ref<HTMLAnchorElement>();",
      "const enchantElem = ref<HTMLButtonElement>();",
    );
    source = replace(
      source,
      '<a ref={enchantElem} className="item-picker-enchant hide" href="javascript:void(0)" attributes={{ role: \'button\' }}></a>',
      '<button ref={enchantElem} type="button" className="item-picker-enchant hide"></button>',
    );
    source = replace(
      source,
      "\t\tthis.enchantElem = enchantElem.value!;",
      `\t\tthis.enchantElem = enchantElem.value!;
\t\tconst preview = () => this.inspectedItem ? { item: this.inspectedItem, player: this.player } : null;
\t\tbindInspection(this.iconElem, preview);
\t\tbindInspection(this.nameElem, preview);
\t\taddItemDetails(this.nameElem, preview);`,
    );
    source = replace(source, "\tclear() {", "\tclear() {\n\t\tthis.inspectedItem = null;");
    source = replace(
      source,
      "\tupdate(newItem: EquippedItem) {",
      "\tupdate(newItem: EquippedItem) {\n\t\tthis.inspectedItem = newItem;",
    );
    const start = source.indexOf("\t\tif (newItem.enchant) {");
    const end = source.indexOf("\n\t}\n}", start);
    if (!source.includes("// KFC enchant controls")) {
      if (start < 0 || end < start) throw new Error("Simulator enchant renderer changed");
      source =
        source.slice(0, start) +
        `\t\t// KFC enchant controls are updated synchronously; no stale description fetch.
\t\tthis.enchantElem.textContent = newItem.enchant ? enchantSummary(newItem.enchant) + ' · Change' : '+ Add enchant';
\t\tbindInspection(this.enchantElem, () => this.inspectedItem?.enchant ? { enchant: this.inspectedItem.enchant, item: this.inspectedItem, player: this.player } : null);` +
        source.slice(end);
    }
    source = replace(
      source,
      "import { getEnchantDescription } from '../../proto_utils/enchants';\n",
      "",
    );
    source = replace(
      source,
      "\t\tthis._equippedItem = newItem;",
      `\t\tthis._equippedItem = newItem;
\t\tconst choices = newItem ? this.player.sim.db?.getEnchants(this.slot) ?? [] : [];
\t\tthis.itemElem.enchantElem.classList.toggle('hide', !newItem || choices.length === 0);
\t\tthis.itemElem.enchantElem.disabled = !newItem || !choices.some(enchant => enchantAppliesToItem(enchant, newItem.item));
\t\tif (this.itemElem.enchantElem.disabled && newItem && choices.length) this.itemElem.enchantElem.textContent = 'No compatible enchants';
\t\tfor (const anchor of [this.itemElem.iconElem, this.itemElem.nameElem]) bindInspection(anchor, () => this.item ? { item: this.item, player: this.player, slot: this.slot } : null);`,
    );
    return source;
  }
  if (file === "list") {
    source = replace(
      source,
      "import tippy from 'tippy.js';",
      "import tippy from 'tippy.js';\nimport { bindInspection, addItemDetails, decorateEnchantChoice, enchantSummary, enchantProblem, installEnchantOptions } from '../../kfc_inspection.js';",
    );
    source = replace(
      source,
      "\t\tconst selected = label === currentTab;",
      "\t\tconst selected = label === currentTab;",
    );
    source = replace(
      source,
      "\t\tthis.searchInput.addEventListener('input', () => this.applyFilters());",
      `\t\tthis.searchInput.addEventListener('input', () => this.applyFilters());
\t\tthis.searchInput.setAttribute('aria-label', label === SelectorModalTabs.Enchants ? 'Search enchants by name or effect' : 'Search items');
\t\tif (label === SelectorModalTabs.Enchants) {
\t\t\tthis.tabContent.classList.add('kfc-enchant-picker');
\t\t\tinstallEnchantOptions(this.tabContent.querySelector<HTMLElement>('.selector-modal-filters')!, player, () => this.applyFilters());
\t\t}`,
    );
    source = replace(
      source,
      "if (phaseSelectorRef.value) makePhaseSelector(phaseSelectorRef.value, player.sim);",
      "if (phaseSelectorRef.value && label !== SelectorModalTabs.Enchants) makePhaseSelector(phaseSelectorRef.value, player.sim);",
    );
    source = replace(
      source,
      "removeButton.textContent = 'Remove Enchant';",
      "removeButton.textContent = 'No enchant';",
    );
    source = replace(
      source,
      "item_height: 56,",
      "item_height: label === SelectorModalTabs.Enchants ? 136 : 56,",
    );
    source = replace(
      source,
      "if (listItemData.phase > this.player.sim.getPhase()) {",
      "if (this.label !== SelectorModalTabs.Enchants && listItemData.phase > this.player.sim.getPhase()) {",
    );
    source = replace(
      source,
      "const name = formatQuery(listItemData.name.toString());",
      "const name = formatQuery(listItemData.name.toString() + (this.label === SelectorModalTabs.Enchants ? ' ' + enchantSummary(listItemData.item as UIEnchant) : ''));",
    );
    source = replace(
      source,
      "\t\t\tthis.onItemClick(itemData);",
      "\t\t\tif (this.label === SelectorModalTabs.Enchants && enchantProblem(itemData.item as UIEnchant, this.gearData.getEquippedItem()?.item ?? null, this.player)) return;\n\t\t\tthis.onItemClick(itemData);",
    );
    source = replace(
      source,
      "\t\tsetItemQualityCssClass(nameElem.value!, itemData.quality);",
      `\t\tconst preview = () => this.label === SelectorModalTabs.Enchants
\t\t\t? { enchant: itemData.item as UIEnchant, player: this.player, slot: this.slot }
\t\t\t: { item: new EquippedItem({ item: itemData.item as UIItem }), player: this.player, slot: this.slot, candidate: true };
\t\tif (this.label !== SelectorModalTabs.RandomSuffixes) {
\t\t\tbindInspection(anchorElem.value!, preview);
\t\t\taddItemDetails(anchorElem.value!, preview);
\t\t}
\t\tif (this.label === SelectorModalTabs.Enchants) decorateEnchantChoice(anchorElem.value!, itemData.item as UIEnchant, this.player, () => this.gearData.getEquippedItem());
\t\tsetItemQualityCssClass(nameElem.value!, itemData.quality);`,
    );
    return source;
  }
  if (file === "selector") {
    source = replace(
      source,
      "import tippy from 'tippy.js';",
      "import tippy from 'tippy.js';\nimport { bindInspection, enchantProblem } from '../../kfc_inspection.js';\nimport { enchantAppliesToItem } from '../../proto_utils/utils.js';\nimport Toast from '../toast';",
    );
    source = replace(
      source,
      "if (equippedItem) {\n\t\t\t\t\t\t\t\tgearData.equipItem(eventID, equippedItem.withEnchant(enchant));",
      `if (equippedItem && enchantAppliesToItem(enchant, equippedItem.item) && !enchantProblem(enchant, equippedItem.item, this.player)) {
\t\t\t\t\t\t\t\tgearData.equipItem(eventID, equippedItem.withEnchant(enchant));`,
    );
    source = replace(
      source,
      "\t\t\t\t\t\t\t\tgearData.equipItem(eventID, equippedItem.withItem(item));",
      `\t\t\t\t\t\t\t\tconst replacement = equippedItem.withItem(item);
\t\t\t\t\t\t\t\tif (equippedItem.enchant && !replacement.enchant) new Toast({ variant: 'info', body: 'The previous enchant was removed because it is incompatible with this item.' });
\t\t\t\t\t\t\t\tgearData.equipItem(eventID, replacement);`,
    );
    source = replace(
      source,
      "\t\t\t\t\tsetItemData();",
      "\t\t\t\t\tsetItemData();\n\t\t\t\t\tbindInspection(anchorRef.value!, () => picker.item ? { item: picker.item, player: this.player, slot: picker.slot } : null);",
    );
    source = replace(
      source,
      "\t\t\t\t\ttippy(anchorRef.value!, {\n\t\t\t\t\t\tcontent: `Edit ${slotNames.get(picker.slot)}`,\n\t\t\t\t\t\tplacement: 'left',\n\t\t\t\t\t});",
      "\t\t\t\t\tanchorRef.value!.setAttribute('aria-label', `Edit ${slotNames.get(picker.slot)}`);",
    );
    return source;
  }
  if (file === "utils") {
    source =
      "import { enchantFitsEvidence } from '../kfc_inspection.js';\n" +
      source.replace("import { enchantFitsEvidence } from '../kfc_inspection.js';\n", "");
    return replace(
      source,
      "export function enchantAppliesToItem(enchant: Enchant, item: Item): boolean {",
      "export function enchantAppliesToItem(enchant: Enchant, item: Item): boolean {\n\tif (!enchantFitsEvidence(enchant, item)) return false;",
    );
  }
  if (file === "db") {
    source = replace(
      source,
      "(this.enchantsBySlot[slots[i]] || []).find(enchant => [enchant.effectId, enchant.itemId, enchant.spellId].includes(itemSpec.enchant))",
      "(this.enchantsBySlot[slots[i]] || []).find(enchant => enchant.effectId === itemSpec.enchant) || (this.enchantsBySlot[slots[i]] || []).find(enchant => enchant.itemId === itemSpec.enchant || enchant.spellId === itemSpec.enchant)",
    );
    return replace(
      source,
      "\t\tlet randomSuffix: ItemRandomSuffix | null = null;",
      `\t\tif (itemSpec.enchant && !enchant) throw new Error('Unknown enchant ' + itemSpec.enchant + ' for ' + item.name + '. Your import was not modified; remove or correct this enchant and import again.');
\t\tlet randomSuffix: ItemRandomSuffix | null = null;`,
    );
  }
  if (file === "sim") {
    source = source.replaceAll(
      "throw new SimError(error instanceof Error ? error.message : 'Invalid enchant');",
      "throw new SimError('[USER_ERROR] ' + (error instanceof Error ? error.message : 'Invalid equipment'));",
    );
    source =
      "import { validateInspectionGear } from './kfc_inspection.js';\n" +
      source.replace("import { validateInspectionGear } from './kfc_inspection.js';\n", "");
    source = source.replace(
      "for (const player of this.raid.getPlayers()) { try { validateInspectionGear(player);",
      "for (const player of this.raid.getPlayers()) { if (!player) continue; try { validateInspectionGear(player);",
    );
    source = replace(
      source,
      "\t\tif (player.getParty() == null) {",
      "\t\ttry { validateInspectionGear(player); } catch (error) { throw new SimError('[USER_ERROR] ' + (error instanceof Error ? error.message : 'Invalid equipment')); }\n\t\tif (player.getParty() == null) {",
    );
    return replace(
      source,
      "\tmakeRaidSimRequest(debug: boolean): RaidSimRequest {",
      "\tmakeRaidSimRequest(debug: boolean): RaidSimRequest {\n\t\tfor (const player of this.raid.getPlayers()) { if (!player) continue; try { validateInspectionGear(player); } catch (error) { throw new SimError('[USER_ERROR] ' + (error instanceof Error ? error.message : 'Invalid equipment')); } }",
    );
  }
  if (file === "settings") {
    source =
      "import { recoverSavedEnchants } from './kfc_inspection.js';\n" +
      source.replace("import { recoverSavedEnchants } from './kfc_inspection.js';\n", "");
    source = replace(
      source,
      "fromProto(eventID: EventID, settings: IndividualSimSettings, includeCategories?: Array<SimSettingCategories>) {",
      "fromProto(eventID: EventID, settings: IndividualSimSettings, includeCategories?: Array<SimSettingCategories>) {\n\t\t// Validate before the inherited event batch, which logs and swallows callback errors.\n\t\tif (!includeCategories?.length || includeCategories.includes(SimSettingCategories.Gear)) {\n\t\t\tif (settings.player?.equipment) this.sim.db.lookupEquipmentSpec(settings.player.equipment);\n\t\t\tif (settings.player?.itemSwap) this.sim.db.lookupItemSwap(settings.player.itemSwap);\n\t\t}",
    );
    return replace(
      source,
      "console.warn('Failed to parse saved settings: ' + e);",
      "recoverSavedEnchants(this.getSettingsStorageKey(), savedSettings, e);\n\t\t\t\t\tconsole.warn('Failed to parse saved settings: ' + e);",
    );
  }
  if (file === "raid") {
    return replace(
      source,
      "fromProto(eventID: EventID, proto: RaidProto) {",
      "fromProto(eventID: EventID, proto: RaidProto) {\n\t\tfor (const party of proto.parties) for (const player of party.players) {\n\t\t\tif (player.equipment) this.sim.db.lookupEquipmentSpec(player.equipment);\n\t\t\tif (player.itemSwap) this.sim.db.lookupItemSwap(player.itemSwap);\n\t\t}",
    );
  }
  throw new Error(`Unknown inspection overlay ${file}`);
}

export async function adaptInspectionSource(root) {
  const files = {
    gear: "ui/core/components/gear_picker/gear_picker.tsx",
    list: "ui/core/components/gear_picker/item_list.tsx",
    selector: "ui/core/components/gear_picker/selector_modal.tsx",
    utils: "ui/core/proto_utils/utils.ts",
    db: "ui/core/proto_utils/database.ts",
    sim: "ui/core/sim.ts",
    settings: "ui/core/individual_sim_ui.ts",
    raid: "ui/core/raid.ts",
  };
  for (const [name, path] of Object.entries(files)) {
    const target = join(root, path);
    await writeFile(target, patchInspectionSource(name, await readFile(target, "utf8")));
  }
  await copyFile(
    new URL("./inspection.ts", import.meta.url),
    join(root, "ui/core/kfc_inspection.ts"),
  );
  for (const file of ["enchant-validation.go", "enchant-validation_test.go"])
    await copyFile(
      new URL(`./${file}`, import.meta.url),
      join(root, "sim/core/kfc_" + file.replaceAll("-", "_")),
    );
  await writeFile(join(root, "sim/core/kfc_enchant_rules.json"), "[]");
  const characterPath = join(root, "sim/core/character.go");
  await writeFile(
    characterPath,
    replace(
      await readFile(characterPath, "utf8"),
      "for slot, item := range character.Equipment {",
      "for slot, item := range character.Equipment {\n\t\tif err := ValidateKfcEnchant(character.Level, proto.ItemSlot(slot), item, player.Class, []proto.Profession{player.Profession1, player.Profession2}); err != nil { panic(err) }",
    ),
  );
  const swapsPath = join(root, "sim/core/item_swaps.go");
  await writeFile(
    swapsPath,
    replace(
      await readFile(swapsPath, "utf8"),
      "for slot, item := range next {",
      "for slot, item := range next {\n\t\tif err := ValidateKfcEnchant(swap.character.Level, proto.ItemSlot(slot), item, swap.character.Class, swap.character.professions[:]); err != nil { panic(err) }",
    ),
  );
  const engineDatabase = join(root, "sim/core/database.go");
  await writeFile(
    engineDatabase,
    replace(
      await readFile(engineDatabase, "utf8"),
      '\t\t// else {\n\t\t// \tpanic(fmt.Sprintf("No enchant with id: %d", itemSpec.Enchant))\n\t\t// }',
      '\t\tif item.Enchant.EffectID == 0 { panic(fmt.Sprintf("Unknown enchant %d; no stats were silently discarded", itemSpec.Enchant)) }',
    ),
  );
  await writeFile(
    join(root, "tools/database/kfc_enchants_generated.go"),
    "package database\nfunc ApplyKfcEnchantAudit(db *WowDatabase) {}\n",
  );
  const generator = join(root, "tools/database/gen_db/main.go");
  await writeFile(
    generator,
    replace(
      await readFile(generator, "utf8"),
      "db.MergeEnchants(database.EnchantOverrides)",
      "db.MergeEnchants(database.EnchantOverrides)\n\tdatabase.ApplyKfcEnchantAudit(db)",
    ),
  );
}
