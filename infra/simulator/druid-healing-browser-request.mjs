/** Build a browser job from an authenticated Restoration Druid template.
 * @param {object} api @param {object} input @returns {object}
 */
export function createDruidHealingBrowserJob(api, input) {
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
    !/^[0-9-]+$/.test(input.talentsString) ||
    !Array.isArray(input.gear) ||
    input.gear.length !== 17 ||
    input.workload?.schema !== "kfc-druid-healing-workload.v1"
  ) {
    throw new Error("Choose a complete, valid Druid healing configuration.");
  }
  const bytes = Uint8Array.from(globalThis.atob(input.requestBase64), (character) =>
      character.charCodeAt(0),
    ),
    request = api.RaidSimRequest.fromBinary(bytes),
    players = request.raid?.parties.flatMap((party) => party.players) ?? [],
    player = players[0];
  if (
    players.length !== 1 ||
    player?.class !== api.druidClass ||
    player.spec?.oneofKind !== "restorationDruid" ||
    player.level !== 60 ||
    player.bonusStats ||
    player.healingModel ||
    player.enableItemSwap ||
    !request.simOptions ||
    request.simOptions.ruleset !== api.foreverRuleset ||
    !request.encounter ||
    request.encounter.targets.length !== 1 ||
    !player.consumes
  ) {
    throw new Error("The saved Druid template does not match this engine.");
  }
  const duration = Number(input.workload.name.match(/-(\d+)s-/)?.[1]);
  if (
    ![180, 300].includes(duration) ||
    !Array.isArray(input.workload.damage) ||
    input.workload.damage.some(
      (event) => event.atMs < 0 || event.atMs >= duration * 1000 || event.raidIndex === 0,
    )
  ) {
    throw new Error("Choose one of the reviewed healing assignments.");
  }
  player.equipment = api.EquipmentSpec.fromJson({ items: input.gear });
  player.talentsString = input.talentsString;
  player.race = input.race;
  for (const [key, allowed] of Object.entries({
    flask: [1, 2],
    food: [1, 4, 6, 8, 10],
    mainHandImbue: [16, 20],
    defaultConjured: [0, 2],
    alcohol: [0, 1, 2, 3, 4, 5],
  })) {
    if (!allowed.includes(input.consumes?.[key]))
      throw new Error("Choose a reviewed Druid consumable.");
    player.consumes[key] = input.consumes[key];
  }
  request.simOptions.iterations = input.iterations;
  request.simOptions.randomSeed = BigInt(input.seed);
  request.encounter.duration = duration;
  const workload = globalThis.structuredClone(input.workload),
    owns = (itemId) => input.gear.some((item) => item.id === itemId);
  workload.cooldowns = workload.cooldowns.filter(
    (policy) =>
      (policy.itemId !== 12662 || input.consumes.defaultConjured === 2) &&
      (policy.itemId !== 272439 || owns(272439)) &&
      (policy.spellId !== 15604 || owns(11819)) &&
      (policy.spellId !== 1302205 || owns(18371)) &&
      (policy.spellId !== 17252 || owns(13143)),
  );
  let binary = "";
  for (const value of api.RaidSimRequest.toBinary(request)) binary += String.fromCharCode(value);
  return {
    schema: "kfc-druid-healing-job.v1",
    id: input.id,
    requestBase64: globalThis.btoa(binary),
    workload,
    detail: false,
  };
}
