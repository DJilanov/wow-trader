import { DUNGEON_QUESTS, DUNGEON_FACTS } from "@wow-trader/leveling";
import { getItemDetail } from "../../../../../lib/data";
import { FOREVER_CLIENT_PRODUCT } from "../../../../../lib/game-versions";
import {
  bindingText,
  calculateWeaponDps,
  formatStat,
  inventoryTypeName,
} from "../../../../../lib/item-tooltip";
import { levelingRewardPreviewSchema } from "../../../../../lib/leveling-rewards";

export const dynamic = "force-dynamic";
const rewardIds = new Set(
  DUNGEON_QUESTS.flatMap((quest) =>
    [...quest.rewards.fixed, ...quest.rewards.choices].map((item) => item.id),
  ),
);
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly itemId: string }> },
): Promise<Response> {
  const { itemId } = await params;
  if (!/^[1-9]\d{0,7}$/.test(itemId) || !rewardIds.has(Number(itemId)))
    return Response.json({ error: "Unknown dungeon reward item." }, { status: 404 });
  if (!process.env.DATABASE_URL)
    return Response.json(
      { error: "Item catalog is unavailable. The Wowhead link remains available." },
      { status: 503 },
    );
  try {
    const item = await getItemDetail(Number(itemId), FOREVER_CLIENT_PRODUCT);
    if (!item)
      return Response.json(
        { error: "This reward is not in the published Forever item catalog." },
        { status: 404 },
      );
    if (item.build.number !== DUNGEON_FACTS.targetBuild)
      return Response.json(
        {
          error: `Item catalog build ${item.build.number} differs from quest reference build ${DUNGEON_FACTS.targetBuild}. Cross-build reward stats are not assumed.`,
        },
        { status: 409 },
      );
    const weapon = item.damages[0];
    return Response.json(
      levelingRewardPreviewSchema.parse({
        itemId: item.itemId,
        name: item.name,
        build: item.build.number,
        requiredLevel: item.requiredLevel,
        slot: inventoryTypeName(item.inventoryType),
        binding: bindingText(item.binding),
        stats: item.stats.map((stat) => formatStat(stat.statType, stat.value)),
        weaponDps: weapon ? calculateWeaponDps(weapon.minimum, weapon.maximum, item.delayMs) : null,
        armor: item.resistances.find((entry) => entry.school === 0)?.value ?? null,
        vendorCopper: Number(item.sellPriceCopper),
        classNames: item.allowedClasses.map((entry) => entry.name),
      }),
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch {
    return Response.json(
      { error: "Item preview is temporarily unavailable. No reward value has been assumed." },
      { status: 503 },
    );
  }
}
