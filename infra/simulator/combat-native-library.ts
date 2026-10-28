import { tankCombatIdentity } from "./tank-native-library";

interface CombatNativeProto extends Record<string, unknown> {
  player: Record<string, unknown>;
  settings: Record<string, unknown>;
}
interface CombatNativeBuild {
  id: string;
  label: string;
  requiresProvisionalEnchantOptIn: boolean;
  warnings: string[];
  proto: CombatNativeProto;
  reference: { iterations: number; dps: { avg: number; stdev: number } };
}
interface CombatNativePayload {
  profile: "warrior";
  defaultBuildId: string;
  builds: CombatNativeBuild[];
}
interface NativeCombatUI {
  rootElem: HTMLElement;
  player: { setConsumes(eventID: number, consumes: Record<string, unknown>): void };
  sim: { waitForInit(): Promise<void> };
  changeEmitter: { on(callback: () => void): { dispose(): void } };
  getSettingsStorageKey(): string;
  toProto(): CombatNativeProto;
  fromProto(eventID: number, settings: CombatNativeProto): void;
  addOnDisposeCallback(callback: () => void): void;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid tested build data");
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value || value.length > maximum)
    throw new Error("Invalid tested build text");
  return value;
}
function finite(value: unknown, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum)
    throw new Error("Invalid tested build measurement");
  return value;
}
export function parseCombatNativePayload(raw: unknown): CombatNativePayload {
  const data = record(raw);
  if (
    data.schema !== "kfc-combat-native-library.v1" ||
    data.profile !== "warrior" ||
    !Array.isArray(data.builds) ||
    data.builds.length < 1 ||
    data.builds.length > 12
  )
    throw new Error("Invalid tested combat library");
  const builds = data.builds.map((value: unknown): CombatNativeBuild => {
    const row = record(value),
      proto = record(row.proto),
      player = record(proto.player),
      settings = record(proto.settings),
      spec = record(player.spec),
      equipment = record(player.equipment),
      reference = record(row.reference),
      dps = record(reference.dps);
    if (
      player.class !== 9 ||
      spec.oneofKind !== "warrior" ||
      player.level !== 60 ||
      player.foreverTier1Bonuses !== false ||
      player.enableItemSwap !== false ||
      settings.ruleset !== 1 ||
      !Number.isSafeInteger(settings.iterations) ||
      finite(settings.iterations, 1) > 100_000 ||
      typeof settings.fixedRngSeed !== "string" ||
      !/^\d{1,16}$/.test(settings.fixedRngSeed) ||
      BigInt(settings.fixedRngSeed) <= 0n
    )
      throw new Error("Tested combat character or ruleset changed");
    record(spec.warrior);
    record(player.consumes);
    if (
      !Array.isArray(equipment.items) ||
      equipment.items.length !== 17 ||
      !equipment.items.every((value: unknown): boolean => {
        const item = record(value);
        return (
          Number.isSafeInteger(item.id) &&
          Number(item.id) >= 0 &&
          (item.enchant === undefined ||
            (Number.isSafeInteger(item.enchant) && Number(item.enchant) >= 0))
        );
      })
    )
      throw new Error("Incomplete tested combat equipment");
    if (
      reference.iterations !== 40_000 ||
      typeof row.requiresProvisionalEnchantOptIn !== "boolean" ||
      !Array.isArray(row.warnings) ||
      row.warnings.length > 20
    )
      throw new Error("Unqualified tested combat build");
    return {
      id: text(row.id, 120),
      label: text(row.label, 180),
      requiresProvisionalEnchantOptIn: row.requiresProvisionalEnchantOptIn,
      warnings: row.warnings.map((value: unknown): string => text(value, 4000)),
      proto: globalThis.structuredClone({ ...proto, player, settings }),
      reference: {
        iterations: 40_000,
        dps: { avg: finite(dps.avg, Number.MIN_VALUE), stdev: finite(dps.stdev, 0) },
      },
    };
  });
  if (new Set(builds.map((row: CombatNativeBuild): string => row.id)).size !== builds.length)
    throw new Error("Duplicate tested combat build");
  const defaultBuildId = text(data.defaultBuildId, 120),
    selected = builds.find((row: CombatNativeBuild): boolean => row.id === defaultBuildId);
  if (!selected || selected.requiresProvisionalEnchantOptIn)
    throw new Error("Tested combat default must use conservative enchants");
  return { profile: "warrior", defaultBuildId, builds };
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = globalThis.document.createElement(tag);
  node.className = className;
  if (content) node.textContent = content;
  return node;
}
function restoreProto(build: CombatNativeBuild): CombatNativeProto {
  const proto = globalThis.structuredClone(build.proto);
  proto.settings.fixedRngSeed = BigInt(String(proto.settings.fixedRngSeed));
  return proto;
}
function applyCombatProto(
  ui: NativeCombatUI,
  proto: CombatNativeProto,
  nextEventID: () => number,
): void {
  ui.fromProto(nextEventID(), proto);
  // Revealing the off-hand picker can restore its old hidden value during gear events.
  ui.player.setConsumes(nextEventID(), globalThis.structuredClone(record(proto.player.consumes)));
}
export function combatBuildIdentity(settings: CombatNativeProto): string {
  return JSON.stringify([settings.settings.ruleset ?? 0, tankCombatIdentity(settings)]);
}
function installLibrary(
  ui: NativeCombatUI,
  payload: CombatNativePayload,
  nextEventID: () => number,
): void {
  const library = ui.rootElem.querySelector<HTMLElement>(".gear-tab-right"),
    configurations = library?.querySelector<HTMLElement>(".preset-configuration-picker-root"),
    gearSets = library?.querySelector<HTMLElement>(
      ".saved-data-manager-root:not(.preset-configuration-picker-root)",
    ),
    configurationPresets = configurations?.querySelector<HTMLElement>(".saved-data-presets"),
    gearPresets = gearSets?.querySelector<HTMLElement>(".saved-data-presets");
  if (!library || !configurations || !gearSets || !configurationPresets || !gearPresets)
    throw new Error("The simulator build and gear menus could not be found");
  const status = element("p", "kfc-combat-build-status"),
    details = element("details", "kfc-combat-build-assumptions"),
    warnings = element("ul", ""),
    buttons: { build: CombatNativeBuild; button: HTMLButtonElement }[] = [],
    identities = new Map(
      payload.builds.map((build: CombatNativeBuild): [string, string] => [
        build.id,
        combatBuildIdentity(build.proto),
      ]),
    );
  status.setAttribute("role", "status");
  details.append(element("summary", "", "Build assumptions and item availability"), warnings);
  configurations.classList.remove("hide");
  configurations.hidden = false;
  configurationPresets.replaceChildren();
  gearPresets.replaceChildren();
  const help = element(
    "p",
    "kfc-combat-build-help",
    "Loads a complete tested setup, including race, professions, buffs and encounter. Save your custom character first.",
  );
  configurations.append(help, status, details);
  const refresh = (): void => {
    status.setAttribute("role", "status");
    const identity = combatBuildIdentity(ui.toProto()),
      selected = payload.builds.find(
        (build: CombatNativeBuild): boolean => identities.get(build.id) === identity,
      );
    for (const { build, button } of buttons) {
      const active = build.id === selected?.id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    warnings.replaceChildren();
    details.hidden = !selected;
    if (!selected) {
      status.textContent =
        "Custom character. Choose a tested setup to load its full configuration.";
      return;
    }
    warnings.replaceChildren(
      ...selected.warnings.map((value: string): HTMLLIElement => element("li", "", value)),
    );
    status.textContent = `${selected.reference.dps.avg.toFixed(1)} DPS reference · 40,000 validation fights. ${selected.requiresProvisionalEnchantOptIn ? "Enable provisional proc models in the enchant picker before simulating." : "Your run may vary within sampling uncertainty."}`;
  };
  const load = (build: CombatNativeBuild): void => {
    const previous = ui.toProto();
    try {
      applyCombatProto(ui, restoreProto(build), nextEventID);
      if (combatBuildIdentity(ui.toProto()) !== identities.get(build.id))
        throw new Error("The simulator did not load the complete tested setup");
      const input = gearSets.querySelector<HTMLInputElement>('input[type="text"]');
      if (input) input.value = build.label;
      refresh();
      status.setAttribute("role", "status");
    } catch (error: unknown) {
      let restored = true;
      try {
        applyCombatProto(ui, previous, nextEventID);
        refresh();
      } catch {
        restored = false;
      }
      status.textContent = `Could not load this setup: ${error instanceof Error ? error.message : "Unknown engine error"}.${restored ? "" : " Reload to restore your saved character."}`;
      status.setAttribute("role", "alert");
    }
  };
  for (const target of [configurationPresets, gearPresets])
    for (const build of payload.builds) {
      const button = element("button", "saved-data-set-chip badge rounded-pill");
      button.type = "button";
      button.dataset.kfcCombatBuild = build.id;
      button.title = build.requiresProvisionalEnchantOptIn
        ? "Optional provisional enchant models; loading this build does not enable them."
        : "Load the complete tested configuration";
      button.append(element("span", "saved-data-set-name", build.label));
      button.addEventListener("click", (): void => load(build));
      target.append(button);
      buttons.push({ build, button });
    }
  const subscription = ui.changeEmitter.on(refresh);
  ui.addOnDisposeCallback((): void => subscription.dispose());
  refresh();
}
export async function mountCombatBuildLibrary(
  createUI: () => NativeCombatUI,
  nextEventID: () => number,
  payloadPath: string,
): Promise<void> {
  let ui: NativeCombatUI | undefined;
  let fetchTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    const saved = new Set(Object.keys(globalThis.localStorage)),
      explicitImport = Boolean(
        globalThis.location.hash ||
        new URL(globalThis.location.href).searchParams.has("build") ||
        new URL(globalThis.location.href).searchParams.has("profile"),
      );
    ui = createUI();
    ui.rootElem.dataset.kfcCombatBuildsReady = "loading";
    const controller = new AbortController();
    fetchTimer = globalThis.setTimeout((): void => controller.abort(), 15_000);
    const response = await globalThis.fetch(payloadPath, { signal: controller.signal });
    if (!response.ok) throw new Error("The tested build data could not be loaded");
    const payload = parseCombatNativePayload(await response.json());
    globalThis.clearTimeout(fetchTimer);
    await ui.sim.waitForInit();
    if (ui.rootElem.dataset.kfcInitialized !== "true")
      throw new Error("The engine has not finished character initialization");
    if (!saved.has(ui.getSettingsStorageKey()) && !explicitImport) {
      const initial = payload.builds.find(
        (build: CombatNativeBuild): boolean => build.id === payload.defaultBuildId,
      );
      if (!initial) throw new Error("Missing tested combat default");
      applyCombatProto(ui, restoreProto(initial), nextEventID);
      if (combatBuildIdentity(ui.toProto()) !== combatBuildIdentity(initial.proto))
        throw new Error("The simulator did not load its tested default");
    }
    installLibrary(ui, payload, nextEventID);
    const importChangedShare = (): void => {
      if (/^#[A-Za-z0-9+/]{64,}={0,2}$/.test(globalThis.location.hash))
        globalThis.location.reload();
    };
    globalThis.addEventListener("hashchange", importChangedShare);
    ui.addOnDisposeCallback((): void =>
      globalThis.removeEventListener("hashchange", importChangedShare),
    );
    ui.rootElem.dataset.kfcCombatBuildsReady = "true";
  } catch (error: unknown) {
    const panel = element("section", "kfc-combat-build-failure"),
      retry = element("button", "btn", "Reload tested builds"),
      message =
        error instanceof Error && error.name === "AbortError"
          ? "The tested build data timed out. Reload to try again."
          : error instanceof Error
            ? error.message
            : "Unknown engine error";
    panel.setAttribute("role", "alert");
    panel.append(
      element("h2", "", "Tested builds could not load"),
      element("p", "", message),
      retry,
    );
    retry.type = "button";
    retry.addEventListener("click", (): void => globalThis.location.reload());
    (ui?.rootElem ?? globalThis.document.body).prepend(panel);
    ui?.rootElem.setAttribute("data-kfc-combat-builds-ready", "error");
  } finally {
    if (fetchTimer !== undefined) globalThis.clearTimeout(fetchTimer);
  }
}
