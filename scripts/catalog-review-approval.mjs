const sha256Pattern = /^[a-f0-9]{64}$/;

/**
 * Keeps review overrides bound to one exact manifest. A later extraction or hotfix must be
 * reviewed independently instead of inheriting an earlier approval.
 *
 * @param {"auto_publish" | "review_required"} assessmentDecision
 * @param {string} manifestSha256
 * @param {string | undefined} approvedManifestSha256
 * @returns {{approved: boolean, mode: "automatic" | "reviewed" | null, manifestSha256: string}}
 */
export function resolveCatalogPromotionApproval(
  assessmentDecision,
  manifestSha256,
  approvedManifestSha256,
) {
  if (!sha256Pattern.test(manifestSha256)) {
    throw new Error("Catalog manifest has an invalid SHA-256 fingerprint.");
  }
  if (assessmentDecision === "auto_publish") {
    return { approved: true, mode: "automatic", manifestSha256 };
  }
  if (assessmentDecision !== "review_required") {
    throw new Error(`Unsupported catalog promotion decision: ${assessmentDecision}`);
  }
  if (approvedManifestSha256 === undefined) {
    return { approved: false, mode: null, manifestSha256 };
  }
  if (!sha256Pattern.test(approvedManifestSha256)) {
    throw new Error("Reviewed catalog approval must be an exact lowercase SHA-256 fingerprint.");
  }
  if (approvedManifestSha256 !== manifestSha256) {
    throw new Error("Reviewed catalog approval does not match the current manifest.");
  }
  return { approved: true, mode: "reviewed", manifestSha256 };
}
