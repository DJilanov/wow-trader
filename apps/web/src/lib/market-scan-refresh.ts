export function hasNewerMarketScan(
  candidateCompletedAt: string,
  renderedCompletedAt: string,
): boolean {
  const candidateTimestamp = Date.parse(candidateCompletedAt);
  const renderedTimestamp = Date.parse(renderedCompletedAt);
  return (
    Number.isFinite(candidateTimestamp) &&
    Number.isFinite(renderedTimestamp) &&
    candidateTimestamp > renderedTimestamp
  );
}
