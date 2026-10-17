import { getForeverObservatoryReport } from "../../../../../../lib/forever-observatory";
import { publicJsonResponse } from "../../../../../../lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return publicJsonResponse(await getForeverObservatoryReport(), { maxAgeSeconds: 900 });
  } catch (error: unknown) {
    console.error("Unable to generate the public Forever observatory report", error);
    return publicJsonResponse(
      { error: "observatory_unavailable", message: "The report is temporarily unavailable." },
      { status: 503, maxAgeSeconds: 30 },
    );
  }
}
