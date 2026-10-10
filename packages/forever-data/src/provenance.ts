import type { ForeverExport } from "./schemas.js";

export interface ForeverSnapshotEvidence {
  readonly state: "demo_preview" | "beta_preview";
  readonly label: string;
  readonly build: string | null;
  readonly warning: string;
}

export function getForeverSnapshotEvidence(data: ForeverExport): ForeverSnapshotEvidence {
  const beta = Object.values(data.talents).some((classData) =>
    classData.trees.some((tree) => tree.talents.some((talent) => talent.src === "beta")),
  );
  const builds = new Set(
    Object.values(data.spellbooks)
      .filter((spellbook) => spellbook.source === "beta" && spellbook.build)
      .map((spellbook) => spellbook.build),
  );
  const build = beta && builds.size === 1 ? ([...builds][0] ?? null) : null;
  return beta
    ? {
        state: "beta_preview",
        label: "Reviewed Forever beta snapshot",
        build,
        warning:
          "Beta data adapted from Talents Forever. Build and hotfix provenance remain attached to the source; this import is not independent client verification and may lag live tuning.",
      }
    : {
        state: "demo_preview",
        label: "BlizzCon demo preview",
        build: null,
        warning:
          "BlizzCon demo preview. Values can change and are not client-verified unless explicitly stated.",
      };
}
