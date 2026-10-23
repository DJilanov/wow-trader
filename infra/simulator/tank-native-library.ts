interface TankNativeProto extends Record<string, unknown> {
  player: Record<string, unknown>;
  settings: Record<string, unknown>;
}
interface TankBuildReference {
  iterations: number;
  health: number;
  armor: number;
  metrics: { threat: { avg: number }; dtps: { avg: number } };
}
interface TankNativeBuild {
  id: string;
  label: string;
  scenario: "raid" | "solo";
  objective: "threat" | "mitigation";
  requiresProvisionalEnchantOptIn: boolean;
  warnings: string[];
  proto: TankNativeProto;
  reference: TankBuildReference;
}
interface TankNativePayload {
  profile: string;
  defaultBuildId: string;
  builds: TankNativeBuild[];
}
interface NativeTankUI {
  rootElem: HTMLElement;
  sim: { waitForInit(): Promise<void> };
  changeEmitter: { on(callback: () => void): { dispose(): void } };
  getSettingsStorageKey(): string;
  toProto(): TankNativeProto;
  fromProto(eventID: number, settings: TankNativeProto): void;
  addOnDisposeCallback(callback: () => void): void;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid tank build data");
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value || value.length > maximum)
    throw new Error("Invalid tank build text");
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error("Invalid tank build measurement");
  return value;
}

export function parseTankNativePayload(raw: unknown): TankNativePayload {
  const data = record(raw),
    classes: Readonly<Record<string, number>> = {
      tank_warrior: 9,
      feral_tank_druid: 1,
      protection_paladin: 4,
    };
  if (
    data.schema !== "kfc-tank-native-library.v1" ||
    typeof data.profile !== "string" ||
    !Object.hasOwn(classes, data.profile) ||
    !Array.isArray(data.builds) ||
    data.builds.length < 4 ||
    data.builds.length > 8
  )
    throw new Error("Invalid tank build library");
  const playerClass = classes[data.profile];
  const builds = data.builds.map((value: unknown): TankNativeBuild => {
    const row = record(value),
      proto = record(row.proto),
      player = record(proto.player),
      settings = record(proto.settings),
      reference = record(row.reference),
      metrics = record(reference.metrics);
    if (
      player.class !== playerClass ||
      player.level !== 60 ||
      player.foreverTier1Bonuses !== false ||
      settings.ruleset !== 1 ||
      !Number.isSafeInteger(settings.iterations) ||
      positive(settings.iterations) > 100000 ||
      typeof settings.fixedRngSeed !== "string" ||
      !/^\d{1,16}$/.test(settings.fixedRngSeed) ||
      BigInt(settings.fixedRngSeed) <= 0n
    )
      throw new Error("Tank build character or ruleset changed");
    const gear = record(player.equipment);
    if (
      !Array.isArray(gear.items) ||
      gear.items.length !== 17 ||
      !gear.items.every(
        (item: unknown): boolean =>
          Number.isSafeInteger(record(item).id) && Number(record(item).id) >= 0,
      )
    )
      throw new Error("Incomplete tank build equipment");
    if (
      !Array.isArray(row.warnings) ||
      row.warnings.length > 20 ||
      typeof row.requiresProvisionalEnchantOptIn !== "boolean" ||
      !["raid", "solo"].includes(String(row.scenario)) ||
      !["threat", "mitigation"].includes(String(row.objective)) ||
      reference.iterations !== 40000
    )
      throw new Error("Unqualified tank build");
    return {
      id: text(row.id, 120),
      label: text(row.label, 180),
      scenario: row.scenario as "raid" | "solo",
      objective: row.objective as "threat" | "mitigation",
      requiresProvisionalEnchantOptIn: row.requiresProvisionalEnchantOptIn,
      warnings: row.warnings.map((warning: unknown): string => text(warning, 4000)),
      proto: { ...proto, player, settings },
      reference: {
        iterations: 40000,
        health: positive(reference.health),
        armor: positive(reference.armor),
        metrics: {
          threat: { avg: positive(record(metrics.threat).avg) },
          dtps: { avg: positive(record(metrics.dtps).avg) },
        },
      },
    };
  });
  if (new Set(builds.map((build): string => build.id)).size !== builds.length)
    throw new Error("Duplicate tank build");
  for (const scenario of ["raid", "solo"])
    for (const objective of ["threat", "mitigation"])
      if (
        builds.filter(
          (build): boolean =>
            build.scenario === scenario &&
            build.objective === objective &&
            !build.requiresProvisionalEnchantOptIn,
        ).length !== 1
      )
        throw new Error("Missing conservative tank setup");
  const defaultBuildId = text(data.defaultBuildId, 120),
    selected = builds.find((build): boolean => build.id === defaultBuildId);
  if (
    !selected ||
    selected.scenario !== "raid" ||
    selected.objective !== "mitigation" ||
    selected.requiresProvisionalEnchantOptIn
  )
    throw new Error("Unsafe tank default");
  return { profile: data.profile, defaultBuildId, builds };
}

function normalized(value: unknown): unknown {
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === 0 ||
    value === 0n ||
    value === ""
  )
    return undefined;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value))
    return value.length
      ? value.map((item: unknown): unknown => normalized(item) ?? null)
      : undefined;
  if (typeof value !== "object") return value;
  const entries = Object.entries(value)
    .sort(([a], [b]): number => a.localeCompare(b))
    .flatMap(([key, item]): [string, unknown][] => {
      const next = normalized(item);
      return next === undefined ? [] : [[key, next]];
    });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function tankCombatIdentity(settings: TankNativeProto): string {
  const player: Record<string, unknown> = {
    ...settings.player,
    level: settings.player.level || 60,
  };
  delete player.database;
  delete player.name;
  return JSON.stringify(
    normalized({
      player,
      ...Object.fromEntries(
        ["raidBuffs", "partyBuffs", "debuffs", "tanks", "encounter", "targetDummies"].map(
          (key): [string, unknown] => [key, settings[key]],
        ),
      ),
    }),
  );
}

function restoreProto(build: TankNativeBuild): TankNativeProto {
  const proto = globalThis.structuredClone(build.proto);
  proto.settings.fixedRngSeed = BigInt(String(proto.settings.fixedRngSeed));
  return proto;
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

function installLibrary(
  ui: NativeTankUI,
  payload: TankNativePayload,
  nextEventID: () => number,
): void {
  const library = ui.rootElem.querySelector<HTMLElement>(".gear-tab-right");
  if (!library) throw new Error("Tank workspace has no build library");
  library
    .querySelectorAll(".kfc-starter-info, .kfc-starter-method")
    .forEach((node: Element): void => node.remove());
  library
    .querySelectorAll<HTMLElement>(".saved-data-presets, .preset-configuration-picker-root")
    .forEach((node: HTMLElement): void => {
      node.hidden = true;
    });
  const title = library.querySelector<HTMLElement>(".kfc-library-title");
  if (title) title.textContent = "Tank builds";
  const savedGear = library.querySelector<HTMLElement>(
    ".saved-data-manager-root:not(.preset-configuration-picker-root)",
  );
  const savedTitle = savedGear?.querySelector<HTMLElement>(".content-block-header-title");
  if (savedTitle) savedTitle.textContent = "Your saved gear sets";
  const oldPresetNames = new Set(
    Array.from(
      library.querySelectorAll(".saved-data-presets .saved-data-set-name"),
      (node: Element): string => node.textContent?.trim() ?? "",
    ),
  );
  const panel = element("section", "kfc-tank-build-library"),
    label = element("label", "", "Choose a tested setup"),
    select = element("select", "form-select"),
    status = element("p", "kfc-tank-build-status"),
    reference = element("dl", "kfc-tank-build-reference"),
    assumptions = element("details", "kfc-tank-build-assumptions"),
    list = element("ul", "");
  select.id = "kfc-tank-build-choice";
  label.htmlFor = select.id;
  const custom = new globalThis.Option("Custom / saved character", "");
  custom.disabled = true;
  select.append(custom);
  for (const optional of [false, true]) {
    const group = element("optgroup", "");
    group.label = optional ? "Optional provisional enchant models" : "Ready to simulate";
    for (const build of payload.builds.filter(
      (row): boolean => row.requiresProvisionalEnchantOptIn === optional,
    ))
      group.append(new globalThis.Option(build.label, build.id));
    if (group.children.length) select.append(group);
  }
  status.setAttribute("role", "status");
  assumptions.append(element("summary", "", "Build assumptions and item availability"), list);
  panel.append(
    label,
    select,
    element(
      "p",
      "kfc-tank-build-help",
      "Selecting a setup replaces gear, enchants, talents, race, professions, buffs and encounter settings. Save your custom character first.",
    ),
    reference,
    status,
    assumptions,
  );
  if (title) title.after(panel);
  else library.prepend(panel);
  const identities = new Map(
    payload.builds.map((build): [string, string] => [build.id, tankCombatIdentity(build.proto)]),
  );
  const refresh = (): void => {
    status.setAttribute("role", "status");
    const identity = tankCombatIdentity(ui.toProto()),
      selected = payload.builds.find((build): boolean => identities.get(build.id) === identity);
    select.value = selected?.id ?? "";
    reference.hidden = !selected;
    assumptions.hidden = !selected;
    if (!selected) {
      status.textContent =
        "Custom character. Choose a tested setup to load its complete configuration.";
      return;
    }
    reference.replaceChildren();
    for (const [name, value] of [
      ["Threat", `${selected.reference.metrics.threat.avg.toFixed(1)} TPS`],
      ["Physical damage taken", `${selected.reference.metrics.dtps.avg.toFixed(1)} / sec`],
      ["Health", Math.round(selected.reference.health).toLocaleString("en-US")],
      ["Armor", Math.round(selected.reference.armor).toLocaleString("en-US")],
    ]) {
      const cell = element("div", "");
      cell.append(element("dt", "", name), element("dd", "", value));
      reference.append(cell);
    }
    list.replaceChildren(
      ...selected.warnings.map((warning): HTMLLIElement => element("li", "", warning)),
    );
    status.textContent = `Reference: 40,000 validation fights. ${selected.requiresProvisionalEnchantOptIn ? "Open Main Hand → Change enchant to explicitly enable provisional proc models before simulating. Loading never enables them." : "Ready to simulate. Your run may vary within sampling uncertainty."}`;
  };
  select.addEventListener("change", (): void => {
    const build = payload.builds.find((row): boolean => row.id === select.value);
    if (!build) return;
    const previous = ui.toProto();
    try {
      ui.fromProto(nextEventID(), restoreProto(build));
      if (tankCombatIdentity(ui.toProto()) !== identities.get(build.id))
        throw new Error("The engine did not load the complete tested setup");
      const name = library.querySelector<HTMLInputElement>(
        '.saved-data-manager-root:not(.preset-configuration-picker-root) input[type="text"]',
      );
      if (name) name.value = build.label;
      refresh();
    } catch (error: unknown) {
      ui.fromProto(nextEventID(), previous);
      refresh();
      status.textContent = `Could not load this setup: ${error instanceof Error ? error.message : "Unknown engine error"}`;
      status.setAttribute("role", "alert");
    }
  });
  const subscription = ui.changeEmitter.on(refresh);
  ui.addOnDisposeCallback((): void => subscription.dispose());
  refresh();
  const active = payload.builds.find((build): boolean => build.id === select.value),
    saveName = savedGear?.querySelector<HTMLInputElement>('input[type="text"]');
  if (active && saveName && (!saveName.value || oldPresetNames.has(saveName.value)))
    saveName.value = active.label;
}

export async function mountTankBuildLibrary(
  createUI: () => NativeTankUI,
  nextEventID: () => number,
  payloadPath: string,
): Promise<void> {
  let ui: NativeTankUI | undefined;
  try {
    const saved = new Map(
        Object.keys(globalThis.localStorage).map((key): [string, string | null] => [
          key,
          globalThis.localStorage.getItem(key),
        ]),
      ),
      explicitImport = Boolean(
        globalThis.location.hash ||
        new URL(globalThis.location.href).searchParams.has("build") ||
        new URL(globalThis.location.href).searchParams.has("profile"),
      );
    const response = await globalThis.fetch(payloadPath);
    if (!response.ok) throw new Error("The tested build data could not be loaded");
    const payload = parseTankNativePayload(await response.json());
    ui = createUI();
    await ui.sim.waitForInit();
    if (ui.rootElem.dataset.kfcInitialized !== "true")
      throw new Error("The engine has not finished character initialization");
    if (!saved.has(ui.getSettingsStorageKey()) && !explicitImport) {
      const initial = payload.builds.find((build): boolean => build.id === payload.defaultBuildId);
      if (!initial) throw new Error("Missing tested tank default");
      ui.fromProto(nextEventID(), restoreProto(initial));
      if (tankCombatIdentity(ui.toProto()) !== tankCombatIdentity(initial.proto))
        throw new Error("The engine did not load the tested tank default");
    }
    installLibrary(ui, payload, nextEventID);
    // The native importer reads share fragments during initialization, including same-page links.
    const importChangedShare = (): void => {
      if (/^#[A-Za-z0-9+/]{64,}={0,2}$/.test(globalThis.location.hash))
        globalThis.location.reload();
    };
    globalThis.addEventListener("hashchange", importChangedShare);
    ui.addOnDisposeCallback((): void =>
      globalThis.removeEventListener("hashchange", importChangedShare),
    );
    ui.rootElem.dataset.kfcTankBuildsReady = "true";
  } catch (error: unknown) {
    const panel = element("section", "kfc-tank-build-failure"),
      retry = element("button", "btn", "Reload tested builds");
    panel.setAttribute("role", "alert");
    panel.append(
      element("h2", "", "Tank builds could not load"),
      element("p", "", error instanceof Error ? error.message : "Unknown engine error"),
      retry,
    );
    retry.type = "button";
    retry.addEventListener("click", (): void => globalThis.location.reload());
    (ui?.rootElem ?? globalThis.document.body).prepend(panel);
    ui?.rootElem.setAttribute("data-kfc-tank-builds-ready", "error");
  }
}
