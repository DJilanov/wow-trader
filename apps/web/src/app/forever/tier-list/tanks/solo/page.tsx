import type { Metadata } from "next";
import {
  ForeverTankTierPage,
  tankTierMetadata,
} from "../../../../../components/forever-tank-tier-page";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return tankTierMetadata("solo");
}
export default async function Page(): Promise<React.JSX.Element> {
  return ForeverTankTierPage({ scenario: "solo" });
}
