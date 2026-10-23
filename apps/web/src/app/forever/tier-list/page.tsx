import type { Metadata } from "next";
import { dpsTierMetadata, ForeverDpsTierPage } from "../../../components/forever-dps-tier-page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return dpsTierMetadata("raid");
}
export default async function RaidDpsTierListPage(): Promise<React.JSX.Element> {
  return ForeverDpsTierPage({ scenario: "raid" });
}
