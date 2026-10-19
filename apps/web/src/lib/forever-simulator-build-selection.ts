import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

export function simulatorBuildLabel(build: LocalSimulatorBuildReview): string {
  if (build.displayName) return build.displayName;
  const variant = build.spec.split("/")[1]?.replaceAll("_", " ") ?? build.spec;
  const name = variant.charAt(0).toUpperCase() + variant.slice(1);
  return `${name} · ${build.requiresProvisionalEnchantOptIn ? "Provisional proc enchants" : "Standard enchants"}`;
}

export function simulatorBuildForPreset(
  builds: readonly LocalSimulatorBuildReview[],
  preset: string,
): LocalSimulatorBuildReview | null {
  return (
    builds.find((build) => {
      if (build.requiresProvisionalEnchantOptIn) return false;
      if (preset === simulatorBuildLabel(build)) return true;
      const name =
        build.id === "rogue-combat-static"
          ? "Combat · Backstab"
          : simulatorBuildLabel(build).replace(/ · Standard enchants$/, "");
      return preset === `${name} · pre-raid tested`;
    }) ?? null
  );
}

const communityBuilds: Readonly<Record<string, string>> = {
  "Arms 34/17/0": "arms-alliance",
  "Fury 18/33/0": "fury-horde",
  "2H Bloodthirst 20/31/0": "two-hand-fury-static",
  "Combat Dual-Wield 15/33/3": "rogue-combat-static",
  "Assassination Mutilate 31/20/0": "rogue-mutilate-static",
  "Subtlety Hemo 20/0/31": "rogue-subtlety-static",
  "Beast Mastery 31/20/0": "hunter-beast-mastery-static",
  "Marksmanship 5/35/11": "hunter-marksmanship-static",
  "Marksmanship 7/40/4": "hunter-marksmanship-static",
  "Survival 7/11/33": "hunter-survival-static",
  "Survival 16/4/31": "hunter-survival-static",
};

export function simulatorBuildForLink(
  builds: readonly LocalSimulatorBuildReview[],
  value: unknown,
): LocalSimulatorBuildReview | null {
  if (typeof value !== "string") return null;
  const id = communityBuilds[value] ?? value;
  return builds.find((build) => build.id === id && !build.requiresProvisionalEnchantOptIn) ?? null;
}
