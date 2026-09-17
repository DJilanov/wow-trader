interface ForeverSnapshotNoticeProps {
  readonly generated: string;
  readonly checksum: string;
}

export function ForeverSnapshotNotice({
  generated,
  checksum,
}: ForeverSnapshotNoticeProps): React.JSX.Element {
  return (
    <aside className="forever-snapshot-notice" aria-label="Preview snapshot">
      <strong>BlizzCon demo preview</strong>
      <span>
        Source generated {generated} · snapshot {checksum.slice(0, 12)}
      </span>
    </aside>
  );
}
