/** Build a personal job for a source-bound Paladin encounter and profession profile.
 * @param {object} api @param {object} input @returns {object}
 */
export function createPaladinHealingFrameBrowserJob(api, input) {
  const context = input?.sourceContext;
  const frame = input?.frame;
  if (
    !input ||
    typeof input.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(input.id) ||
    !Number.isSafeInteger(input.iterations) ||
    input.iterations < 1 ||
    input.iterations > 10000 ||
    !Number.isSafeInteger(input.seed) ||
    input.seed < 1 ||
    !context ||
    context.playerClass !== api.paladinClass ||
    ![1, 2].includes(context.faction) ||
    !Array.isArray(context.professions) ||
    context.professions.length !== 2 ||
    context.professions.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 11) ||
    context.professions[0] >= context.professions[1] ||
    input.race !== context.raceId ||
    !api.eligibleRaces.includes(input.race) ||
    !frame ||
    !["burst", "group", "tank"].includes(frame.kind) ||
    ![180, 300].includes(frame.durationSeconds) ||
    !["stacked", "spread"].includes(frame.layout) ||
    (frame.kind === "tank" && frame.layout !== "stacked") ||
    typeof input.talentsString !== "string" ||
    !/^[0-5]*-[0-5]*-[0-5]*$/.test(input.talentsString) ||
    [...input.talentsString.replaceAll("-", "")].reduce((sum, value) => sum + Number(value), 0) !==
      51 ||
    !Array.isArray(input.gear) ||
    input.gear.length !== 17 ||
    input.gear.some(
      (item) =>
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id < 0 ||
        (item.enchant !== undefined && (!Number.isSafeInteger(item.enchant) || item.enchant <= 0)),
    ) ||
    typeof input.sourceRequestBase64 !== "string" ||
    input.sourceRequestBase64.length > 128000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.sourceRequestBase64) ||
    input.workload?.schema !== "kfc-paladin-healing-workload.v1" ||
    input.workload.assignmentScoring !== "external-demand-v1" ||
    input.workload.requireFullTalentBuild !== true
  )
    throw new Error("Choose a complete, valid Paladin encounter configuration.");

  const raw = Uint8Array.from(globalThis.atob(input.sourceRequestBase64), (character) =>
    character.charCodeAt(0),
  );
  const request = api.RaidSimRequest.fromBinary(raw);
  const players =
    request.raid?.parties
      .flatMap((party) => party.players)
      .filter((player) => player.class !== 0) ?? [];
  const player = players[0];
  if (
    players.length !== 1 ||
    player?.class !== api.paladinClass ||
    player.spec?.oneofKind !== "holyPaladin" ||
    player.level !== 60 ||
    player.race !== context.raceId ||
    player.profession1 !== context.professions[0] ||
    player.profession2 !== context.professions[1] ||
    player.bonusStats ||
    player.healingModel ||
    player.enableItemSwap ||
    !player.consumes ||
    !request.simOptions ||
    request.simOptions.ruleset !== api.foreverRuleset ||
    !request.encounter ||
    request.encounter.targets.length !== 1 ||
    request.encounter.duration !== frame.durationSeconds
  )
    throw new Error(
      "The saved Paladin template does not match this encounter or profession profile.",
    );

  const positions = frame.layout === "spread" ? [0, -30, -12, 12, 30] : [0, 2, 4, 6, 8];
  if (
    typeof input.workload.name !== "string" ||
    !new RegExp(
      `^synthetic-${frame.kind}-${frame.durationSeconds}s-[0-9]+(?:\\.[0-9]+)?dps${frame.layout === "spread" ? "-spread" : ""}$`,
    ).test(input.workload.name) ||
    !Array.isArray(input.workload.targets) ||
    input.workload.targets.length !== 5 ||
    new Set(input.workload.targets.map((target) => target.raidIndex)).size !== 5 ||
    input.workload.targets.some(
      (target) => target.x !== positions[target.raidIndex] || target.y !== 0,
    ) ||
    !Array.isArray(input.workload.damage) ||
    !Array.isArray(input.workload.cooldowns) ||
    input.workload.damage.some(
      (event) =>
        !Number.isSafeInteger(event.atMs) ||
        event.atMs < 0 ||
        event.atMs >= frame.durationSeconds * 1000 ||
        !Number.isSafeInteger(event.raidIndex) ||
        event.raidIndex < 1 ||
        event.raidIndex > 4,
    )
  )
    throw new Error("Choose the reviewed Paladin encounter and positioning.");

  const domains = {
    flask: [1, 2],
    food: [1, 3, 4, 9, 11],
    mainHandImbue: [16, 20],
    defaultPotion: [0, 5],
    defaultConjured: [0, 2],
    manaRegenElixir: [0, 2],
    alcohol: [0, 1, 2, 3, 4, 5],
  };
  for (const [field, allowed] of Object.entries(domains))
    if (!allowed.includes(input.consumes?.[field]))
      throw new Error("Choose a supported pre-raid Paladin consumable.");
  const equipment = api.EquipmentSpec.fromJson({ items: input.gear });
  const equipmentOrConsumesChanged =
    JSON.stringify(equipment) !== JSON.stringify(player.equipment) ||
    Object.keys(domains).some((field) => (player.consumes[field] ?? 0) !== input.consumes[field]);
  for (const field of Object.keys(domains)) player.consumes[field] = input.consumes[field];
  player.equipment = equipment;
  player.talentsString = input.talentsString;
  request.simOptions.iterations = input.iterations;
  request.simOptions.randomSeed = BigInt(input.seed);
  const workload = globalThis.structuredClone(input.workload);
  if (equipmentOrConsumesChanged) {
    const owns = (id) => input.gear.some((item) => item.id === id);
    const spellOwners = new Map([
      [15604, 11819],
      [1302205, 18371],
      [17252, 13143],
    ]);
    const equippedUses = new Set([4381, 18637, 4262, 8346, 272439, 272438, 20512, 11808]);
    workload.cooldowns = workload.cooldowns.filter(
      (entry) =>
        (entry.itemId !== 13444 || input.consumes.defaultPotion === 5) &&
        (entry.itemId !== 12662 || input.consumes.defaultConjured === 2) &&
        (!equippedUses.has(entry.itemId) || owns(entry.itemId)) &&
        (!spellOwners.has(entry.spellId) || owns(spellOwners.get(entry.spellId))),
    );
  }
  let binary = "";
  for (const value of api.RaidSimRequest.toBinary(request)) binary += String.fromCharCode(value);
  return {
    schema: "kfc-paladin-healing-job.v1",
    id: input.id,
    requestBase64: globalThis.btoa(binary),
    workload,
    detail: false,
  };
}
