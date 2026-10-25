export function communityEvidenceSource(evidence: unknown, fallback: string): string {
  if (!evidence || typeof evidence !== "object" || !("source" in evidence)) return fallback;
  if (evidence.source === "wowhead") return "Wowhead Forever";
  if (evidence.source === "questiedb_forever") return "QuestieDB Forever";
  return fallback;
}

export function communityEvidenceMethod(evidence: unknown): string {
  if (!evidence || typeof evidence !== "object" || !("matchMethod" in evidence))
    return "Published source reference";
  const method = evidence.matchMethod;
  if (method === "unique_profession_name_match") return "Name-matched teaching item";
  if (method === "client_description_name_match") return "Matched teaching description";
  if (method === "output_identity_name_match") return "Matched crafted-item identity";
  if (method === "pinned_community_baseline") return "Pinned community baseline";
  return "Source-reported relationship";
}
