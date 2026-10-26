import {
  createReviewedFullRaidDruidProfileAdaptersV6,
  type FullRaidDruidProfileAdapters,
} from "./forever-simulator-full-raid-druid-profile-v6";
import type { FullRaidDruidProfilePinsV3 } from "./forever-simulator-full-raid-druid-profile-schema-v3";

const delivery = {
  release: "ce2375bbbbc13f564a8717f3",
  proofSha256: "1ecb8de56af1c80a121517d72be5693f94c2bc33c111adf73f109ef5ab535d91",
  buildPins: {
    correctionByteSha256: "3c08ae9f66f1166232144693d2cc4d7562cb1a3f5d2c821485dde26c1dc0fb36",
    confirmationByteSha256: "987fe925f530a753e708130e9404421d1d9b56fc0536ab13a093b70c6aa33168",
    supervisorRunSha256: "084c2db322597dc18d18a11cb962a1ea197c1988a15c66fa82266e90c5f498ad",
    supervisorRunId: "b700a386-29c5-4a13-ad0c-daf256297eb2",
    builds: {
      "feral-cat-static": "c8b6e0801084d03b22e3aff2135605a4fef545b1ad122e3da50819c866ae5208",
      "balance-static": "9ddf836a2f601229cac182927094cb85af6b1f3f57e8ae511e07f336380348a4",
    },
  },
  publications: {
    feral_druid: "ec9f6e65b45edc7d79f2f63769aa26b04c5c24261d87672d22b57a6d17a877ce",
    balance_druid: "6ea23b01e3a7ee5ed68e3481e6aebd9590ed57fa8dfe5b222bc40ac85b50f8ef",
  },
  browserReviewSha256: "7702b8f402b9f2621588928890654e0fc9b9f1e3c4fe0bd81b72fd13a0028b9c",
} satisfies FullRaidDruidProfilePinsV3;
const adapters = createReviewedFullRaidDruidProfileAdaptersV6(delivery);

export const readFullRaidDruidProfile: FullRaidDruidProfileAdapters["readProfile"] =
  adapters.readProfile;
export const validateFullRaidDruidPublication: FullRaidDruidProfileAdapters["validatePublication"] =
  adapters.validatePublication;
export const validateFullRaidDruidPublishedRows: FullRaidDruidProfileAdapters["validatePublishedRows"] =
  adapters.validatePublishedRows;
