export interface StatusPillProps {
  readonly value: string;
}

export function StatusPill({ value }: StatusPillProps): React.JSX.Element {
  const safeClass =
    value === "complete" || value === "applied" || value === "published" ? "positive" : "caution";
  return <span className={`status-pill ${safeClass}`}>{value.replaceAll("_", " ")}</span>;
}
