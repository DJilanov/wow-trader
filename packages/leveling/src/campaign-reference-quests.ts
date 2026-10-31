interface CampaignReferenceQuest {
  readonly id: number;
  readonly title: string;
  readonly pickupStage: "before";
  readonly pickup: string;
  readonly objective: string;
  readonly turnin: string;
  readonly position: null;
  readonly prerequisiteIds: readonly number[];
  readonly objectiveIndices: readonly number[];
}

// Historical lifecycles absent from an applicable Alliance source branch.
// The Stone Circle is reviewed against authorized chapters 33, 40 and 41;
// the other records use authored QuestieDB export e9a67d1a2753a0e64c4c96bf7864788fac7b765f.
// These execution instructions supply neither drop-rate nor XP evidence.
const references: readonly CampaignReferenceQuest[] = [
  {
    id: 3444,
    title: "The Stone Circle",
    pickupStage: "before",
    pickup:
      "Accept The Stone Circle from Marvon Rivetseeker in Tanaris after returning The Sunken Temple.",
    objective:
      "Collect the Stone Circle from Marvon's Chest in Ratchet, The Barrens, and keep it for Marvon.",
    turnin:
      "Return the Stone Circle to Marvon Rivetseeker in Tanaris. Take Into the Depths and Secret of the Circle on the same visit.",
    position: null,
    prerequisiteIds: [3445],
    objectiveIndices: [1],
  },
  {
    id: 1100,
    title: "Lonebrow's Journal",
    pickupStage: "before",
    pickup:
      "Take Henrig Lonebrow's Journal beside the Great Lift in Thousand Needles. Each player needs their own copy.",
    objective: "Read the journal and carry it to Falfindel Waywarder in Thalanaar.",
    turnin:
      "Deliver the journal to Falfindel Waywarder in Thalanaar before accepting The Crone of the Kraul.",
    position: null,
    prerequisiteIds: [],
    objectiveIndices: [1],
  },
  {
    id: 3520,
    title: "Screecher Spirits",
    pickupStage: "before",
    pickup:
      "Accept Screecher Spirits from Yeh'kinya in Steamwheedle Port, Tanaris. Keep the supplied Yeh'kinya's Bramble.",
    objective:
      "In Feralas, defeat Vale Screechers and use Yeh'kinya's Bramble on their corpses. Speak to the summoned spirits until every player's quest tracker is complete.",
    turnin:
      "Return Screecher Spirits to Yeh'kinya in Steamwheedle Port. Accept The Prophecy of Mosh'aru for Zul'Farrak.",
    position: null,
    prerequisiteIds: [],
    objectiveIndices: [1],
  },
  {
    id: 2988,
    title: "Witherbark Cages",
    pickupStage: "before",
    pickup:
      "Accept Witherbark Cages from Gryphon Master Talonaxe at Aerie Peak in The Hinterlands. Learn the flight path while here.",
    objective:
      "Inspect the first, second and third Witherbark cages in the Witherbark villages. Everyone must receive all three investigation credits.",
    turnin: "Return to Gryphon Master Talonaxe at Aerie Peak and accept The Altar of Zul.",
    position: null,
    prerequisiteIds: [],
    objectiveIndices: [1, 2, 3],
  },
  {
    id: 2989,
    title: "The Altar of Zul",
    pickupStage: "before",
    pickup:
      "Accept The Altar of Zul from Gryphon Master Talonaxe after returning Witherbark Cages.",
    objective:
      "Reach the top of the Altar of Zul together and confirm that every player receives the investigation credit.",
    turnin: "Return to Gryphon Master Talonaxe at Aerie Peak and accept Thadius Grimshade.",
    position: null,
    prerequisiteIds: [2988],
    objectiveIndices: [1],
  },
  {
    id: 2990,
    title: "Thadius Grimshade",
    pickupStage: "before",
    pickup:
      "Accept Thadius Grimshade from Gryphon Master Talonaxe at Aerie Peak after The Altar of Zul. Keep Sharpbeak's Feather.",
    objective:
      "Carry Sharpbeak's Feather to Thadius Grimshade in Nethergarde Keep, Blasted Lands. This is a delivery, not another mob farm.",
    turnin:
      "Deliver Sharpbeak's Feather to Thadius Grimshade in Nethergarde Keep. Accept Nekrum's Medallion before traveling to Zul'Farrak.",
    position: null,
    prerequisiteIds: [2989],
    objectiveIndices: [],
  },
  {
    id: 4787,
    title: "The Ancient Egg",
    pickupStage: "before",
    pickup:
      "After returning both Mosh'aru tablets from Zul'Farrak, accept The Ancient Egg from Yeh'kinya in Steamwheedle Port.",
    objective:
      "Travel together to Jintha'Alor in The Hinterlands and collect the Ancient Egg inside the cave. Check every player's quest tracker before leaving.",
    turnin:
      "Return the Ancient Egg to Yeh'kinya in Steamwheedle Port. Accept The God Hakkar and keep the supplied egg for Sunken Temple.",
    position: null,
    prerequisiteIds: [3527],
    objectiveIndices: [1],
  },
];

export function getCampaignReferenceQuest(id: number): CampaignReferenceQuest | null {
  return references.find((quest) => quest.id === id) ?? null;
}

// Reviewed links cover omitted earlier chains and optional source breadcrumbs.
export function campaignReferencePrerequisites(id: number): readonly number[] | null {
  const reviewed: Readonly<Record<number, readonly number[]>> = {
    1275: [],
    1452: [1451],
    1469: [1452],
    1475: [1469],
    3444: [3445],
    3446: [3444],
    3447: [3444],
    3527: [3520],
    3528: [4787],
  };
  if (reviewed[id]) return reviewed[id];
  return getCampaignReferenceQuest(id)?.prerequisiteIds ?? null;
}
