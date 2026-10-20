export type SearchSurfaceState = "indexable" | "review_required" | "excluded";

export type SearchSurfaceReason =
  | "page_missing"
  | "authoritative_identity_missing"
  | "identity_conflict"
  | "required_evidence_missing"
  | "invalid_canonical"
  | "eligible";

export type SearchSurfaceEvidenceKind =
  | "exact_client"
  | "published_reference"
  | "published_community"
  | "runtime_observation"
  | "manual_review";

export interface SearchSurfaceEntry {
  readonly url: string;
  readonly canonical: string;
  readonly state: SearchSurfaceState;
  readonly reasons: readonly SearchSurfaceReason[];
  readonly lastModified: Date | null;
  readonly contentHash: string | null;
  readonly outgoingLinks: readonly string[];
  readonly evidenceKinds: readonly SearchSurfaceEvidenceKind[];
}

export interface SearchSurfaceFacts {
  readonly url: string;
  readonly canonical?: string;
  readonly pageExists: boolean;
  readonly authoritativeIdentityPresent: boolean;
  readonly identityConflict?: boolean;
  readonly requiredEvidencePresent: boolean;
  readonly lastModified?: Date | null;
  readonly contentHash?: string | null;
  readonly outgoingLinks?: readonly string[];
  readonly evidenceKinds?: readonly SearchSurfaceEvidenceKind[];
}

export function assessSearchSurface(facts: SearchSurfaceFacts): SearchSurfaceEntry {
  const canonical = facts.canonical ?? facts.url;
  const reasons: SearchSurfaceReason[] = [];

  if (!isAbsoluteHttpUrl(facts.url) || !isAbsoluteHttpUrl(canonical)) {
    reasons.push("invalid_canonical");
  }
  if (!facts.pageExists) reasons.push("page_missing");
  if (!facts.authoritativeIdentityPresent) reasons.push("authoritative_identity_missing");
  if (facts.identityConflict) reasons.push("identity_conflict");
  if (!facts.requiredEvidencePresent) reasons.push("required_evidence_missing");

  const state: SearchSurfaceState = reasons.some(
    (reason) => reason === "page_missing" || reason === "invalid_canonical",
  )
    ? "excluded"
    : reasons.length
      ? "review_required"
      : "indexable";

  return {
    url: facts.url,
    canonical,
    state,
    reasons: reasons.length ? reasons : ["eligible"],
    lastModified: facts.lastModified ?? null,
    contentHash: facts.contentHash ?? null,
    outgoingLinks: uniqueSorted(facts.outgoingLinks ?? []),
    evidenceKinds: uniqueSorted(facts.evidenceKinds ?? []),
  };
}

export function isIndexableSearchSurface(entry: SearchSurfaceEntry): boolean {
  return entry.state === "indexable";
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
