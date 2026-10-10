import { getForeverSnapshotEvidence } from "@wow-trader/forever-data";

import { getForeverSnapshot } from "../../../../../lib/forever";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const snapshot = await getForeverSnapshot();
  if (!snapshot) {
    return Response.json({ error: "No reviewed Forever preview is published" }, { status: 404 });
  }
  const evidence = getForeverSnapshotEvidence(snapshot.data);

  return Response.json(
    {
      contract: "kfc-forever-preview.v1",
      state: evidence.state,
      snapshot: {
        id: snapshot.snapshotId,
        checksum: snapshot.checksum,
        sourcePayloadChecksum: snapshot.sourcePayloadChecksum,
        generated: snapshot.generated,
        retrievedAt: snapshot.retrievedAt.toISOString(),
        publishedAt: snapshot.publishedAt.toISOString(),
        build: evidence.build,
      },
      license: {
        id: snapshot.source.license,
        url: snapshot.source.licenseUrl,
        attribution: snapshot.source.attribution,
        modifiedBy: "KFC Helper",
      },
      source: {
        name: snapshot.source.name,
        homepage: snapshot.source.homepageUrl,
        data: snapshot.source.dataUrl,
      },
      evidence: {
        warning: evidence.warning,
      },
      data: snapshot.data,
      supplemental: snapshot.supplemental,
    },
    {
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        etag: `"${snapshot.checksum}"`,
      },
    },
  );
}
