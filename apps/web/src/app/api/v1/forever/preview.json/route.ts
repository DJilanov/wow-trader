import { getForeverSnapshot } from "../../../../../lib/forever";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const snapshot = await getForeverSnapshot();
  if (!snapshot) {
    return Response.json({ error: "No reviewed Forever preview is published" }, { status: 404 });
  }

  return Response.json(
    {
      contract: "kfc-forever-preview.v1",
      state: "demo_preview",
      snapshot: {
        id: snapshot.snapshotId,
        checksum: snapshot.checksum,
        sourcePayloadChecksum: snapshot.sourcePayloadChecksum,
        generated: snapshot.generated,
        retrievedAt: snapshot.retrievedAt.toISOString(),
        publishedAt: snapshot.publishedAt.toISOString(),
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
        warning:
          "BlizzCon demo preview. Values can change and are not client-verified unless explicitly stated.",
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
