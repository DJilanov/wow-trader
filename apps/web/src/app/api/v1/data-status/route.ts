import { getDashboardData } from "../../../../lib/data";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const data = await getDashboardData();
    return Response.json({ ...data, generatedAt: new Date().toISOString() });
  } catch {
    return Response.json(
      { error: "data_unavailable", message: "Catalog or market storage is unavailable" },
      { status: 503 },
    );
  }
}
