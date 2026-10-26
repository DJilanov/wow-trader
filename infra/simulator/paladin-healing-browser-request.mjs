/** Build a personal browser job while retaining the authenticated template's resource timings.
 * @param {object} api @param {object} input @returns {object}
 */
export function createPaladinHealingBrowserJob(api, input) {
  if (
    !input ||
    typeof input.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(input.id) ||
    !Number.isSafeInteger(input.iterations) ||
    input.iterations < 1 ||
    input.iterations > 10000 ||
    !Number.isSafeInteger(input.seed) ||
    input.seed < 1 ||
    !api.eligibleRaces.includes(input.race) ||
    typeof input.talentsString !== "string" ||
    !/^[0-5]*-[0-5]*-[0-5]*$/.test(input.talentsString) ||
    !Array.isArray(input.gear) ||
    input.gear.length !== 17 ||
    input.gear.some(
      (item) =>
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id < 0 ||
        (item.enchant !== undefined && (!Number.isSafeInteger(item.enchant) || item.enchant <= 0)),
    ) ||
    input.workload?.schema !== "kfc-paladin-healing-workload.v1" ||
    input.workload.assignmentScoring !== "external-demand-v1" ||
    input.workload.requireFullTalentBuild !== true ||
    typeof input.sourceRequestBase64 !== "string" ||
    input.sourceRequestBase64.length > 128000
  ) {
    throw new Error("Choose a complete, valid Paladin healing configuration.");
  }
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
    player.bonusStats ||
    player.healingModel ||
    player.enableItemSwap ||
    !player.consumes ||
    !request.simOptions ||
    request.simOptions.ruleset !== api.foreverRuleset ||
    !request.encounter ||
    request.encounter.targets.length !== 1 ||
    request.encounter.duration !== 180
  ) {
    throw new Error("The saved Paladin template does not match this healing engine.");
  }
  if (
    !input.workload.name.includes("-180s-") ||
    !Array.isArray(input.workload.damage) ||
    input.workload.damage.some(
      (event) =>
        !Number.isSafeInteger(event.atMs) ||
        event.atMs < 0 ||
        event.atMs >= 180000 ||
        event.raidIndex === 0,
    )
  )
    throw new Error("Choose the reviewed three-minute Paladin assignment.");
  const domains = {
    flask: [1, 2],
    food: [1, 3, 4, 9, 11],
    mainHandImbue: [16, 20],
    defaultPotion: [0, 5],
    defaultConjured: [0, 2],
    manaRegenElixir: [0, 2],
    alcohol: [0, 1, 2, 3, 4, 5],
  };
  for (const [field, allowed] of Object.entries(domains)) {
    if (!allowed.includes(input.consumes?.[field]))
      throw new Error("Choose a supported pre-raid Paladin consumable.");
    player.consumes[field] = input.consumes[field];
  }
  player.equipment = api.EquipmentSpec.fromJson({ items: input.gear });
  player.talentsString = input.talentsString;
  player.race = input.race;
  request.simOptions.iterations = input.iterations;
  request.simOptions.randomSeed = BigInt(input.seed);
  const workload = globalThis.structuredClone(input.workload);
  const owns = (id) => input.gear.some((item) => item.id === id);
  const spellOwners = new Map([
    [15604, 11819],
    [1302205, 18371],
    [17252, 13143],
  ]);
  const equippedUses = new Set([4381, 18637, 4262, 8346, 272439]);
  workload.cooldowns = workload.cooldowns.filter(
    (entry) =>
      (entry.itemId !== 13444 || input.consumes.defaultPotion === 5) &&
      (entry.itemId !== 12662 || input.consumes.defaultConjured === 2) &&
      (!equippedUses.has(entry.itemId) || owns(entry.itemId)) &&
      (!spellOwners.has(entry.spellId) || owns(spellOwners.get(entry.spellId))),
  );
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
