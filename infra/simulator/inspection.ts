import tippy, { type Instance } from "tippy.js";
import type { State } from "@popperjs/core";
import manifest from "./kfc_inspection.json";
import { Class, ItemSlot, type Faction, type Profession, type Stat } from "./proto/common.js";
import type { UIEnchant, UIItem } from "./proto/ui.js";
import type { EquippedItem } from "./proto_utils/equipped_item.js";
import { enchantAppliesToItem } from "./proto_utils/utils.js";
import {
  armorTypeNames,
  classNames,
  professionNames,
  slotNames,
  statNames,
  weaponTypeNames,
} from "./proto_utils/names.js";

interface EnchantEvidence {
  effectId: number;
  spellId: number;
  type: number;
  extraTypes: number[];
  enchantType: number;
  name: string;
  label: string;
  stats: number[];
  status: string;
  reason: string;
  minLevel: number;
  maxLevel: number;
  itemLevelMin: number;
  itemLevelMax: number;
  requiredSkill: number;
  requiredSkillRank: number;
  requiredProfession: number;
  classAllowlist: number[];
  armorTypes: number[];
  condition: number;
  description: string[];
}
interface InspectionManifest {
  source: { build: string; hotfix: string };
  enchants: Record<string, EnchantEvidence>;
  items: Record<
    string,
    {
      setId: number;
      binding: number;
      requiredLevel: number;
      provenance?: string;
      provenanceNote?: string;
      modelNote?: string;
      limitCategory?: number;
      questChoice?: string | null;
      questRewardOnce?: boolean;
      questChoices?: string[];
      effects: { spellId: number; name: string; trigger: number }[];
    }
  >;
  sets: Record<
    string,
    { name: string; effects: { threshold: number; spellId: number; name: string }[] }
  >;
}
export interface InspectionPlayer {
  getClass(): Class;
  getFaction(): Faction;
  getProfessions(): Profession[];
  getEquippedItem(slot: ItemSlot): EquippedItem | null;
  getGear(): { asArray(): (EquippedItem | null)[] };
  getEnableItemSwap(): boolean;
  getItemSwapGear(): { asArray(): (EquippedItem | null)[] };
  getForeverRevelationModel(): { enabled: boolean } | undefined;
}
interface Preview {
  item?: EquippedItem;
  enchant?: UIEnchant;
  player: InspectionPlayer;
  slot?: ItemSlot;
  candidate?: boolean;
}
const data: InspectionManifest = manifest;
const bindings = new WeakMap<HTMLElement, () => Preview | null>();
const provisionalPlayers = new WeakSet<InspectionPlayer>();
let active: Instance | null = null;
let details: HTMLDialogElement | null = null;
let installed = false;
let removeService: (() => void) | undefined;

function key(enchant: UIEnchant): string {
  return `${enchant.effectId}:${enchant.spellId}:${enchant.type}`;
}
export function enchantEvidence(enchant: UIEnchant): EnchantEvidence | undefined {
  return data.enchants[key(enchant)];
}

export function enchantFitsEvidence(enchant: UIEnchant, item: UIItem): boolean {
  const evidence = enchantEvidence(enchant);
  return Boolean(
    evidence &&
    !evidence.condition &&
    item.ilvl >= evidence.itemLevelMin &&
    (!evidence.itemLevelMax || item.ilvl <= evidence.itemLevelMax),
  );
}

export function enchantProblem(
  enchant: UIEnchant,
  item: UIItem | null,
  player: InspectionPlayer,
  requireOptIn = true,
): string {
  const evidence = enchantEvidence(enchant);
  if (!item) return "Equip an item first.";
  if (!evidence) return "This enchant has no reviewed Forever record. Choose another enchant.";
  if (!enchantAppliesToItem(enchant, item))
    return "This item does not meet the enchant's slot, weapon or item-level requirements.";
  if (evidence.status === "unsupported") return `Not supported: ${evidence.reason}`;
  if (evidence.minLevel > 60 || (evidence.maxLevel && evidence.maxLevel < 60))
    return "Not usable at the simulator's level 60.";
  if (evidence.classAllowlist.length && !evidence.classAllowlist.includes(player.getClass()))
    return "This enchant requires another class.";
  if (evidence.requiredProfession && !player.getProfessions().includes(evidence.requiredProfession))
    return "Select the required wearer profession first.";
  if (evidence.requiredSkill && !evidence.requiredProfession)
    return "Wearer skill requirement is not modeled; this enchant is unavailable.";
  if (
    enchant.effectId === 8217 &&
    ([Class.ClassWarrior, Class.ClassRogue].includes(player.getClass()) ||
      !player.getForeverRevelationModel()?.enabled)
  )
    return "Revelation needs a supported class and the explicit model under Model & tools.";
  if (requireOptIn && evidence.status === "provisional" && !provisionalPlayers.has(player))
    return "Enable provisional proc models in the Enchant tab to use this enchant. Its Forever proc behavior is unverified.";
  return "";
}

export function allowProvisionalEnchants(player: InspectionPlayer, allowed: boolean): void {
  if (allowed) provisionalPlayers.add(player);
  else provisionalPlayers.delete(player);
}

export function validateInspectionGear(player: InspectionPlayer): void {
  const groups = [
    player.getGear().asArray(),
    ...(player.getEnableItemSwap() ? [player.getItemSwapGear().asArray()] : []),
  ];
  for (const items of groups) {
    const unique = new Set<number>(),
      categories = new Set<number>(),
      quests = new Set<string>();
    for (const equipped of items) {
      if (!equipped) continue;
      const item = equipped.item,
        metadata = data.items[item.id];
      if (item.classAllowlist.length && !item.classAllowlist.includes(player.getClass()))
        throw new Error(`${item.name}: requires a different class. Select compatible equipment.`);
      if (item.factionRestriction && Number(item.factionRestriction) !== player.getFaction())
        throw new Error(
          `${item.name}: requires a different faction. Replace it with a compatible item for your race.`,
        );
      if (item.requiredProfession && !player.getProfessions().includes(item.requiredProfession))
        throw new Error(
          `${item.name}: select ${professionNames.get(item.requiredProfession)} as a profession or replace this item.`,
        );
      if (item.unique && unique.has(item.id))
        throw new Error(`${item.name}: cannot equip two copies of a unique item.`);
      if (metadata?.limitCategory && categories.has(metadata.limitCategory))
        throw new Error(
          `${item.name}: conflicts with another unique-equipped category. Replace one of the conflicting items.`,
        );
      if (metadata?.questRewardOnce && unique.has(item.id))
        throw new Error(`${item.name}: only one copy is available from the reviewed quest source.`);
      if (metadata?.questChoices?.some((quest) => quests.has(quest)))
        throw new Error(
          `${item.name}: these are mutually exclusive quest rewards. Replace one of them.`,
        );
      unique.add(item.id);
      if (metadata?.limitCategory) categories.add(metadata.limitCategory);
      for (const quest of metadata?.questChoices ?? []) quests.add(quest);
      if (!equipped.enchant) continue;
      const problem = enchantProblem(equipped.enchant, equipped.item, player);
      if (problem) throw new Error(`${equipped.enchant.name}: ${problem}`);
    }
  }
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  className = "",
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}

const percentages = new Set([13, 14, 15, 18, 19, 20, 22, 29, 31, 32, 33]);
function statLines(stats: readonly number[]): string[] {
  return stats.flatMap((value, index) => {
    if (!value) return [];
    const name = statNames.get(index as Stat) ?? `Stat ${index}`;
    return [
      `${value > 0 ? "+" : ""}${Number(value.toFixed(3))}${percentages.has(index) ? "%" : ""} ${name}`,
    ];
  });
}
export function enchantSummary(enchant: UIEnchant): string {
  const evidence = enchantEvidence(enchant);
  const lines = statLines(enchant.stats);
  return lines.length ? lines.join(" · ") : evidence?.label.replace(/\$k\d/g, "?") || enchant.name;
}

function appendEnchant(root: HTMLElement, enchant: UIEnchant, applied: boolean): void {
  const evidence = enchantEvidence(enchant);
  root.append(node("p", `${applied ? "Enchanted: " : ""}${enchant.name}`, "kfc-tooltip-effect"));
  const lines = statLines(enchant.stats);
  for (const line of lines) root.append(node("p", line, "kfc-tooltip-effect"));
  if (!lines.length && evidence) {
    root.append(node("p", evidence.label.replace(/\$k\d/g, "?"), "kfc-tooltip-effect"));
    for (const text of evidence.description) root.append(node("p", text, "kfc-tooltip-effect"));
  }
  if (evidence) {
    root.append(node("p", evidence.reason, "kfc-tooltip-note"));
    if (evidence.itemLevelMin)
      root.append(node("p", `Requires item level ${evidence.itemLevelMin}`));
    if (evidence.itemLevelMax)
      root.append(node("p", `Maximum item level ${evidence.itemLevelMax}`));
    if (evidence.minLevel) root.append(node("p", `Requires level ${evidence.minLevel}`));
    if (evidence.requiredProfession)
      root.append(
        node("p", `Wearer profession: ${professionNames.get(evidence.requiredProfession)}`),
      );
  }
}

function render(preview: Preview): HTMLElement {
  const root = node("section", "", "kfc-item-tooltip");
  if (preview.enchant) {
    root.append(node("h3", preview.enchant.name, "kfc-tooltip-title"));
    appendEnchant(root, preview.enchant, false);
    const problem = enchantProblem(
      preview.enchant,
      preview.item?.item ??
        preview.player.getEquippedItem(preview.slot ?? ItemSlot.ItemSlotHead)?.item ??
        null,
      preview.player,
    );
    if (problem) root.append(node("p", problem, "kfc-tooltip-warning"));
  } else if (preview.item) {
    const equipped = preview.item,
      item = equipped.item;
    const title = node(
      "h3",
      item.name + (equipped.randomSuffix ? ` ${equipped.randomSuffix.name}` : ""),
      `kfc-tooltip-title quality-${item.quality}`,
    );
    root.append(title, node("p", `Item Level ${item.ilvl}`, "kfc-tooltip-note"));
    const metadata = data.items[item.id];
    if (metadata?.provenance === "classic-provisional")
      root.append(
        node(
          "p",
          "Provisional Classic reference — " + metadata.provenanceNote,
          "kfc-tooltip-warning",
        ),
      );
    if (metadata?.provenance === "current-client-historical-acquisition")
      root.append(
        node(
          "p",
          "Current-client stats · provisional acquisition — " + metadata.provenanceNote,
          "kfc-tooltip-warning",
        ),
      );
    if (metadata?.modelNote) root.append(node("p", metadata.modelNote, "kfc-tooltip-note"));
    if (item.unique) root.append(node("p", "Unique-Equipped"));
    if (metadata?.binding === 1) root.append(node("p", "Binds when picked up"));
    if (metadata?.binding === 2) root.append(node("p", "Binds when equipped"));
    root.append(
      node(
        "p",
        `${preview.slot !== undefined ? (slotNames.get(preview.slot) ?? "Equipment") : "Equipment"} · ${armorTypeNames.get(item.armorType) || weaponTypeNames.get(item.weaponType) || ""}`,
      ),
    );
    if (item.weaponSpeed > 0) {
      root.append(
        node(
          "p",
          `${item.weaponDamageMin}–${item.weaponDamageMax} damage · Speed ${item.weaponSpeed.toFixed(2)}`,
        ),
      );
      root.append(
        node(
          "p",
          `(${((item.weaponDamageMin + item.weaponDamageMax) / (2 * item.weaponSpeed)).toFixed(1)} damage per second)`,
        ),
      );
    }
    const stats = item.stats.map((value, i) => value + (equipped.randomSuffix?.stats[i] ?? 0));
    for (const line of statLines(stats)) root.append(node("p", line));
    if (item.classAllowlist.length)
      root.append(
        node("p", `Classes: ${item.classAllowlist.map((id) => classNames.get(id)).join(", ")}`),
      );
    if (metadata?.requiredLevel) root.append(node("p", `Requires Level ${metadata.requiredLevel}`));
    if (equipped.enchant) appendEnchant(root, equipped.enchant, true);
    for (const effect of metadata?.effects ?? [])
      root.append(
        node(
          "p",
          `${effect.trigger === 0 ? "Use" : effect.trigger === 1 ? "Equip" : "Effect"}: ${effect.name}`,
          "kfc-tooltip-effect",
        ),
      );
    if (metadata?.effects.length)
      root.append(
        node(
          "p",
          "Client effect references; descriptions do not guarantee engine implementation.",
          "kfc-tooltip-note",
        ),
      );
    const set = metadata?.setId ? data.sets[metadata.setId] : undefined;
    if (set) {
      const gear = preview.player.getGear().asArray();
      if (preview.candidate && preview.slot !== undefined) gear[preview.slot] = equipped;
      const count = gear.filter(
        (entry) => entry && data.items[entry.id]?.setId === metadata.setId,
      ).length;
      root.append(
        node(
          "p",
          `${set.name} (${count} equipped)${preview.candidate ? " · if equipped" : ""}`,
          "kfc-tooltip-set",
        ),
      );
      for (const bonus of set.effects)
        root.append(
          node(
            "p",
            `(${bonus.threshold}) Set: ${bonus.name}`,
            count >= bonus.threshold ? "kfc-tooltip-effect" : "kfc-tooltip-note",
          ),
        );
      root.append(
        node(
          "p",
          "Set names are client references; utility bonuses may be unmodeled.",
          "kfc-tooltip-note",
        ),
      );
    }
    root.append(
      node(
        "p",
        "Base lines are simulation stats; applied enchants are listed separately. Percentage stats are percentage points, not client rating units.",
        "kfc-tooltip-note",
      ),
    );
  }
  root.append(
    node(
      "p",
      preview.item && data.items[preview.item.item.id]?.provenance === "classic-provisional"
        ? "Historical Classic reference · provisional Forever assumption"
        : preview.item &&
            data.items[preview.item.item.id]?.provenance === "current-client-historical-acquisition"
          ? `Current client ${data.source.build} · historical source assumption`
          : `Client metadata ${data.source.build} · pinned simulation data`,
      "kfc-tooltip-source",
    ),
  );
  return root;
}

function hide(): void {
  if (active && !active.state.isDestroyed) active.destroy();
  active = null;
}
function findBinding(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-kfc-inspect]") : null;
}
function visibleBounds(): { left: number; top: number; right: number; bottom: number } {
  const bounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  // frameElement is null for a cross-origin parent. Read geometry only when accessible.
  const frame = window.frameElement;
  const parent = frame?.ownerDocument.defaultView;
  if (!frame || !parent) return bounds;
  const rect = frame.getBoundingClientRect();
  const scaleX = rect.width / window.innerWidth || 1;
  const scaleY = rect.height / window.innerHeight || 1;
  return {
    left: Math.max(0, -rect.left / scaleX),
    top: Math.max(0, -rect.top / scaleY),
    right: Math.min(bounds.right, (parent.innerWidth - rect.left) / scaleX),
    bottom: Math.min(bounds.bottom, (parent.innerHeight - rect.top) / scaleY),
  };
}
function limitHeight(content: HTMLElement): void {
  const bounds = visibleBounds();
  content.style.maxHeight = `${Math.max(40, Math.min(680, bounds.bottom - bounds.top - 40))}px`;
}
function installService(): void {
  if (installed) return;
  installed = true;
  const show = (event: Event): void => {
    if (event instanceof PointerEvent && event.pointerType === "touch") return;
    const anchor = findBinding(event.target),
      preview = anchor && bindings.get(anchor)?.();
    if (!anchor || !preview) return;
    const dialog =
      document.querySelector("dialog[open]") ??
      Array.from(document.querySelectorAll('.modal.show, .modal[aria-modal="true"]')).at(-1);
    if (dialog && !dialog.contains(anchor)) {
      hide();
      return;
    }
    if (active?.reference === anchor && active.state.isVisible) return;
    hide();
    const content = render(preview);
    limitHeight(content);
    active = tippy(anchor, {
      content,
      trigger: "manual",
      // Hover previews must not intercept selection clicks. Long stats use the details dialog.
      interactive: false,
      aria: { content: "describedby", expanded: false },
      role: "tooltip",
      appendTo: () => document.body,
      placement: "right",
      maxWidth: 370,
      zIndex: 10000,
      popperOptions: {
        strategy: "fixed",
        modifiers: [
          {
            name: "flip",
            options: { boundary: "viewport", fallbackPlacements: ["left", "bottom", "top"] },
          },
          { name: "preventOverflow", options: { boundary: "viewport", padding: 12 } },
          {
            name: "kfcVisibleFrame",
            enabled: true,
            phase: "main",
            requires: ["popperOffsets", "preventOverflow"],
            fn: ({ state }: { state: State }): void => {
              const offsets = state.modifiersData.popperOffsets;
              if (!offsets) return;
              const bounds = visibleBounds();
              offsets.x = Math.max(
                bounds.left + 12,
                Math.min(offsets.x, bounds.right - state.rects.popper.width - 12),
              );
              offsets.y = Math.max(
                bounds.top + 12,
                Math.min(offsets.y, bounds.bottom - state.rects.popper.height - 12),
              );
            },
          },
        ],
      },
      hideOnClick: false,
      touch: false,
      duration: 0,
    });
    active.show();
  };
  const leave = (event: Event): void => {
    if (!active) return;
    const next = (event as FocusEvent | PointerEvent).relatedTarget;
    if (next instanceof Node && (active.reference.contains(next) || active.popper.contains(next)))
      return;
    if (
      event.target instanceof Node &&
      (active.reference.contains(event.target) || active.popper.contains(event.target))
    )
      hide();
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    hide();
  };
  const click = (): void => hide();
  const updatePosition = (): void => {
    const content = active?.popper.querySelector<HTMLElement>(".kfc-item-tooltip");
    if (content) limitHeight(content);
    void active?.popperInstance?.update();
  };
  const parentView = window.frameElement?.ownerDocument.defaultView;
  parentView?.addEventListener("scroll", updatePosition, true);
  parentView?.addEventListener("resize", updatePosition);
  window.addEventListener("resize", updatePosition);
  const observer = new MutationObserver(() => {
    if (active && !active.reference.isConnected) hide();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("pointerover", show);
  document.addEventListener("focusin", show);
  document.addEventListener("pointerout", leave);
  document.addEventListener("focusout", leave);
  document.addEventListener("pointerdown", click);
  document.addEventListener("hide.bs.modal", click);
  document.addEventListener("show.bs.modal", click);
  document.addEventListener("shown.bs.modal", click);
  document.addEventListener("keydown", escape, true);
  removeService = (): void => {
    hide();
    details?.close();
    details?.remove();
    details = null;
    observer.disconnect();
    document.removeEventListener("pointerover", show);
    document.removeEventListener("focusin", show);
    document.removeEventListener("pointerout", leave);
    document.removeEventListener("focusout", leave);
    document.removeEventListener("pointerdown", click);
    document.removeEventListener("hide.bs.modal", click);
    document.removeEventListener("show.bs.modal", click);
    document.removeEventListener("shown.bs.modal", click);
    document.removeEventListener("keydown", escape, true);
    parentView?.removeEventListener("scroll", updatePosition, true);
    parentView?.removeEventListener("resize", updatePosition);
    window.removeEventListener("resize", updatePosition);
    installed = false;
  };
}
export function disposeInspection(): void {
  removeService?.();
  removeService = undefined;
}
export function bindInspection(anchor: HTMLElement, getPreview: () => Preview | null): void {
  installService();
  bindings.set(anchor, getPreview);
  anchor.dataset.kfcInspect = "true";
  if (active?.reference === anchor) {
    const preview = getPreview();
    if (!preview || active.state.isDestroyed) hide();
    else {
      const content = render(preview);
      limitHeight(content);
      active.setContent(content);
    }
  }
}

export function recoverSavedEnchants(storageKey: string, original: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (!/enchant/i.test(message)) return;
  const warning = node("div", "", "kfc-build-recovery");
  warning.setAttribute("role", "alert");
  let preserved = true;
  try {
    window.localStorage.setItem(`${storageKey}_enchant_recovery`, original);
  } catch {
    preserved = false;
  }
  warning.append(node("p", `Saved build could not load in full: ${message}`));
  warning.append(
    node(
      "p",
      preserved
        ? "Your original build is backed up locally. Download it below, correct the enchant and import it again."
        : "Browser storage is full. Download your original build now before leaving this page.",
    ),
  );
  const download = node("button", "Download original build");
  download.type = "button";
  download.addEventListener("click", (): void => {
    const url = URL.createObjectURL(new Blob([original], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "original-simulator-build.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  warning.append(download);
  (document.querySelector(".kfc-workspace") ?? document.body).prepend(warning);
}

export function addItemDetails(anchor: HTMLElement, getPreview: () => Preview | null): void {
  const button = node("button", "ⓘ", "kfc-item-details");
  button.type = "button";
  button.setAttribute("aria-label", "Inspect item stats");
  anchor.after(button);
  button.addEventListener("click", (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    hide();
    const preview = getPreview();
    if (!preview) return;
    details?.close();
    details?.remove();
    const dialog = document.createElement("dialog");
    details = dialog;
    dialog.className = "kfc-item-details-dialog";
    dialog.setAttribute("aria-label", "Item stats");
    const close = node("button", "Close", "kfc-details-close");
    close.type = "button";
    dialog.append(close, render(preview));
    (button.closest(".modal.show") ?? document.body).append(dialog);
    close.addEventListener("click", (): void => dialog.close());
    dialog.addEventListener("click", (clickEvent: MouseEvent): void => {
      if (clickEvent.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") keyEvent.stopPropagation();
    });
    dialog.addEventListener(
      "close",
      (): void => {
        dialog.remove();
        button.focus();
        if (details === dialog) details = null;
      },
      { once: true },
    );
    dialog.showModal();
    close.focus();
  });
}

export function installEnchantOptions(
  container: HTMLElement,
  player: InspectionPlayer,
  refresh: () => void,
): void {
  const label = node("label", "", "kfc-enchant-optin");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = provisionalPlayers.has(player);
  label.append(
    checkbox,
    node("span", "Allow provisional proc models (unverified Forever behavior)"),
  );
  container.append(
    label,
    node(
      "p",
      "Select an enchant to apply it. Kits replace the current permanent enhancement. Recipe/vendor availability is not verified; oils and weapon imbues are configured separately.",
      "kfc-enchant-help",
    ),
  );
  checkbox.addEventListener("change", (): void => {
    allowProvisionalEnchants(player, checkbox.checked);
    refresh();
  });
}

export function decorateEnchantChoice(
  anchor: HTMLElement,
  enchant: UIEnchant,
  player: InspectionPlayer,
  getItem: () => EquippedItem | null,
): void {
  const evidence = enchantEvidence(enchant);
  anchor.append(node("span", enchantSummary(enchant), "kfc-enchant-summary"));
  anchor.append(node("span", evidence?.status ?? "unsupported", "kfc-enchant-status"));
  const problem = enchantProblem(enchant, getItem()?.item ?? null, player);
  anchor.setAttribute("aria-disabled", String(Boolean(problem)));
  if (problem) anchor.append(node("span", problem, "kfc-enchant-reason"));
}
