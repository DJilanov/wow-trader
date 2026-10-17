export function hasNewerMarketScan(
  candidateCompletedAt: string,
  renderedCompletedAt: string | null,
): boolean {
  const candidateTimestamp = Date.parse(candidateCompletedAt);
  if (renderedCompletedAt === null) return Number.isFinite(candidateTimestamp);
  const renderedTimestamp = Date.parse(renderedCompletedAt);
  return (
    Number.isFinite(candidateTimestamp) &&
    Number.isFinite(renderedTimestamp) &&
    candidateTimestamp > renderedTimestamp
  );
}
