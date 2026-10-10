import { getForeverSnapshotEvidence, type ForeverExport } from "@wow-trader/forever-data";

interface ForeverSnapshotNoticeProps {
  readonly generated: string;
  readonly checksum: string;
  readonly data: ForeverExport;
}

export function ForeverSnapshotNotice({
  generated,
  checksum,
  data,
}: ForeverSnapshotNoticeProps): React.JSX.Element {
  const evidence = getForeverSnapshotEvidence(data);
  return (
    <aside className="forever-snapshot-notice" aria-label="Preview snapshot">
      <strong>
        {evidence.label}
        {evidence.build ? ` / ${evidence.build}` : ""}
      </strong>
      <span>
        Source generated {generated} · snapshot {checksum.slice(0, 12)}
      </span>
    </aside>
  );
}
