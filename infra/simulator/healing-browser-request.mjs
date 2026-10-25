/** Build a local browser job from an admitted Priest template.
 * @param {object} api @param {object} input @returns {object}
 */
export function createHealingBrowserJob(api, input) {
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
    !input.workload ||
    input.workload.schema !== "kfc-healing-workload.v1"
  ) {
    throw new Error("Choose a complete, valid healing configuration.");
  }
  const bytes = Uint8Array.from(globalThis.atob(input.requestBase64), (character) =>
    character.charCodeAt(0),
  );
  const request = api.RaidSimRequest.fromBinary(bytes);
  const players = request.raid?.parties.flatMap((party) => party.players) ?? [];
  const player = players[0];
  if (
    players.length !== 1 ||
    player?.class !== api.priestClass ||
    player.spec?.oneofKind !== "healingPriest" ||
    player.level !== 60 ||
    player.bonusStats ||
    player.healingModel ||
    player.enableItemSwap ||
    !request.simOptions ||
    request.simOptions.ruleset !== api.foreverRuleset ||
    !request.encounter ||
    request.encounter.targets.length !== 1
  ) {
    throw new Error("The saved healing template does not match this engine.");
  }
  const duration = Number(input.workload.name.match(/-(\d+)s-/)?.[1]);
  if (
    ![180, 300].includes(duration) ||
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
    food: [1, 3, 4, 9, 11],
    mainHandImbue: [16, 20],
    defaultConjured: [0, 2],
  })) {
    if (!allowed.includes(input.consumes?.[key])) throw new Error("Choose a reviewed consumable.");
    player.consumes[key] = input.consumes[key];
  }
  request.simOptions.iterations = input.iterations;
  request.simOptions.randomSeed = BigInt(input.seed);
  request.encounter.duration = duration;
  const workload = globalThis.structuredClone(input.workload);
  if (input.race !== api.trollRace)
    workload.cooldowns = workload.cooldowns.filter((policy) => policy.spellId !== 20554);
  if (input.consumes.defaultConjured !== 2)
    workload.cooldowns = workload.cooldowns.filter((policy) => policy.itemId !== 12662);
  if (!input.gear.some((item) => item.id === 11819))
    workload.cooldowns = workload.cooldowns.filter((policy) => policy.spellId !== 15604);
  const output = api.RaidSimRequest.toBinary(request);
  let binary = "";
  for (const value of output) binary += String.fromCharCode(value);
  return {
    schema: "kfc-healing-job.v1",
    id: input.id,
    requestBase64: globalThis.btoa(binary),
    workload,
    detail: false,
  };
}
