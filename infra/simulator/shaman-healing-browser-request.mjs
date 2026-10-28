/** Encode a personal job while preserving the reviewed actor, buffs and encounter.
 * @param {object} api @param {object} input @returns {object}
 */
export function createShamanHealingBrowserJob(api, input) {
  if (
    !input ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.id ?? "") ||
    !Number.isSafeInteger(input.iterations) ||
    input.iterations < 1 ||
    input.iterations > 10000 ||
    !Number.isSafeInteger(input.seed) ||
    input.seed < 1 ||
    !api.eligibleRaces.includes(input.race) ||
    !/^[0-5]*-[0-5]*-[0-5]*$/.test(input.talentsString ?? "") ||
    !Array.isArray(input.gear) ||
    input.gear.length !== 17 ||
    input.gear.some(
      (item) =>
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id < 0 ||
        (item.enchant !== undefined && (!Number.isSafeInteger(item.enchant) || item.enchant <= 0)),
    ) ||
    input.workload?.schema !== "kfc-shaman-equipped-workload.v1" ||
    typeof input.sourceRequestBase64 !== "string" ||
    input.sourceRequestBase64.length > 500000
  )
    throw new Error("Choose a complete valid Shaman healing setup.");
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
    player?.class !== api.shamanClass ||
    player.spec?.oneofKind !== "restorationShaman" ||
    player.level !== 60 ||
    player.bonusStats ||
    player.healingModel ||
    player.enableItemSwap ||
    !player.consumes ||
    !request.simOptions ||
    request.simOptions.ruleset !== api.foreverRuleset ||
    request.encounter?.duration !== 180 ||
    request.encounter.targets.length !== 1
  )
    throw new Error("The saved template does not match this Shaman healing engine.");
  const fields = [
    "flask",
    "food",
    "mainHandImbue",
    "defaultPotion",
    "defaultConjured",
    "manaRegenElixir",
    "healthElixir",
    "zanzaBuff",
    "alcohol",
    "spellPowerBuff",
    "firePowerBuff",
    "shadowPowerBuff",
    "frostPowerBuff",
  ];
  for (const field of fields) player.consumes[field] = input.consumes[field] ?? 0;
  if (input.consumes.miscConsumes || player.consumes.miscConsumes) {
    player.consumes.miscConsumes ??= {};
    for (const field of ["raptorPunch", "jujuEmber", "jujuChill"])
      player.consumes.miscConsumes[field] = input.consumes.miscConsumes?.[field] ?? false;
  }
  const talentKey = (value) =>
    value
      .split("-")
      .map((part) => part.replace(/0+$/, ""))
      .join("-");
  if (talentKey(player.talentsString) !== talentKey(input.talentsString))
    player.talentsString = input.talentsString;
  player.equipment = api.EquipmentSpec.fromJson({ items: input.gear });
  player.race = input.race;
  player.foreverMp5PerSecond = input.workload.mp5Model === "per-second-reference";
  request.simOptions.iterations = input.iterations;
  request.simOptions.randomSeed = BigInt(input.seed);
  let binary = "";
  for (const value of api.RaidSimRequest.toBinary(request)) binary += String.fromCharCode(value);
  return {
    schema: "kfc-shaman-equipped-job.v1",
    id: input.id,
    requestBase64: globalThis.btoa(binary),
    workload: structuredClone(input.workload),
    detail: false,
  };
}
