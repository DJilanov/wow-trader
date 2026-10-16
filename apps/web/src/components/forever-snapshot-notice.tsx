import { getForeverSnapshotEvidence, type ForeverExport } from "@wow-trader/forever-data";
import { readTalentSyncStatus } from "@wow-trader/forever-data/talent-sync";
import { resolve } from "node:path";
import Link from "next/link";

interface ForeverSnapshotNoticeProps {
  readonly generated: string;
  readonly checksum: string;
  readonly data: ForeverExport;
}

export async function ForeverSnapshotNotice({
  generated,
  checksum,
  data,
}: ForeverSnapshotNoticeProps): Promise<React.JSX.Element> {
  const evidence = getForeverSnapshotEvidence(data);
  // Health is supplementary: a broken status file must not hide a valid published snapshot.
  const health = await readTalentSyncStatus(
    resolve(
      /* turbopackIgnore: true */ process.env.FOREVER_UPDATES_ROOT ||
        "../../artifacts/forever-updates",
    ),
  ).catch(() => null);
  return (
    <aside className="forever-snapshot-notice" aria-label="Preview snapshot">
      <strong>
        {evidence.label}
        {evidence.build ? ` / ${evidence.build}` : ""}
      </strong>
      <span>
        Source generated {generated} · snapshot {checksum.slice(0, 12)}
      </span>
      {health ? (
        <span>
          Last source check{" "}
          {new Date(health.checkedAt).toISOString().replace("T", " ").replace(".000Z", " UTC")}
          {health.error
            ? " · Update failed; last good snapshot retained."
            : health.checksum !== checksum
              ? " · You are viewing an older immutable snapshot."
              : " · Daily source checks enabled."}
        </span>
      ) : null}
      <Link href="/forever/encyclopedia/changes">Official announcements and source history →</Link>
    </aside>
  );
}
