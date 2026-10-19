/**
 * A client build can be reused only when the published snapshot was produced by the same catalog
 * extractor. Extractor upgrades can add normalized evidence without a client or hotfix change.
 */
export function canReusePublishedCatalog(
  published,
  installed,
  hotfixHash,
  expectedExtractorVersion,
) {
  return Boolean(
    published &&
    published.buildNumber === installed.buildNumber &&
    published.hotfixHash === hotfixHash &&
    (!expectedExtractorVersion || published.extractorVersion === expectedExtractorVersion),
  );
}

export function catalogExtractorCacheSegment(extractorVersion) {
  if (!/^[A-Za-z0-9._-]+$/.test(extractorVersion)) {
    throw new Error("Catalog extractor cache version contains unsupported characters.");
  }
  return `extractor-${extractorVersion}`;
}
