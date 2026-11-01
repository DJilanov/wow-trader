import { readCompositionCatalog } from "../src/lib/forever-raid-composition-data";
import {
  analyzeComposition,
  createComposition,
  suggestComposition,
} from "../src/lib/forever-raid-composition";
const catalog = await readCompositionCatalog();
console.log({
  evidence: catalog.evidence,
  measuredAt: catalog.measuredAt,
  profiles: catalog.profiles.length,
  references: catalog.profiles.filter((profile) => profile.reference).length,
});
for (const size of [10, 20, 40] as const) {
  const draft = createComposition(size, catalog),
    analysis = analyzeComposition(draft, catalog),
    start = performance.now();
  const result = suggestComposition(draft, catalog);
  console.log({
    size,
    seats: draft.seats.length,
    roles: analysis.roles,
    issues: analysis.issues,
    changes: result.changes.length,
    error: result.error,
    states: result.evaluatedStates,
    durationMs: Math.round(performance.now() - start),
  });
}
