import type { CheerioAPI } from "cheerio";

export function parseRequiredQuestItems(
  $: CheerioAPI,
  game: "tbc" | "forever",
): readonly { readonly itemId: number; readonly quantity: number }[] {
  const items = new Map<number, number>();
  // Restrict extraction to the objective prose, never reward/vendor/sidebar item links.
  const article = $("h1").first().parent().clone();
  article.find("script,style,.infobox,.db-page-collection-tracker-cta,.guide-image-links").remove();
  const nodes = article.contents().toArray();
  const start = nodes.findIndex((node) => $(node).is("h1"));
  if (start < 0) return [];
  const end = nodes.findIndex((node, index) => index > start && $(node).is("h1,h2"));
  const progress = nodes.findIndex(
    (node) => $(node).is("h2") && $(node).text().trim() === "Progress",
  );
  const progressEnd = nodes.findIndex((node, index) => index > progress && $(node).is("h1,h2"));
  const regions = [
    ...nodes.slice(start + 1, end < 0 ? undefined : end),
    ...(progress < 0
      ? []
      : nodes
          .slice(progress + 1, progressEnd < 0 ? undefined : progressEnd)
          .filter(
            (node) => $(node).is("table.icon-list") || $(node).find("table.icon-list").length > 0,
          )),
  ];
  for (const node of regions) {
    const fragment = $(node);
    const anchors = fragment.is("a") ? fragment : fragment.find("a[href]");
    for (const anchor of anchors.toArray()) {
      const link = $(anchor);
      const href = link.attr("href");
      if (!href) continue;
      let url: URL;
      try {
        url = new URL(href, "https://www.wowhead.com");
      } catch {
        continue;
      }
      const match = new RegExp(`^/${game}/item=(\\d+)(?:/|$)`).exec(url.pathname);
      if (url.origin !== "https://www.wowhead.com" || !match) continue;
      const itemId = Number(match[1]);
      const row = link.closest("tr,li");
      const identities = new Set(
        row
          .find("a[href]")
          .toArray()
          .flatMap((entry) => {
            try {
              const candidate = new URL($(entry).attr("href")!, "https://www.wowhead.com");
              const identity = /^\/(?:forever|tbc)\/item=(\d+)(?:\/|$)/.exec(candidate.pathname);
              return identity ? [Number(identity[1])] : [];
            } catch {
              return [];
            }
          }),
      );
      if (identities.size !== 1) continue;
      const text = row.text().replace(/\s+/g, " ").trim();
      const counter = /(?:\(\s*(\d+)\s*\)|\bx\s*(\d+)\b)\s*$/i.exec(text);
      const quantity = counter ? Number(counter[1] ?? counter[2]) : null;
      if (
        !Number.isSafeInteger(itemId) ||
        itemId < 1 ||
        quantity === null ||
        quantity < 1 ||
        quantity > 10000
      )
        continue;
      if (items.has(itemId) && items.get(itemId) !== quantity)
        throw new Error("Conflicting quest item quotas");
      items.set(itemId, quantity);
    }
  }
  return [...items].map(([itemId, quantity]) => ({ itemId, quantity }));
}
