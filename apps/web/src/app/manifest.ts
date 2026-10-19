import type { MetadataRoute } from "next";

import { withHelperBasePath } from "../lib/site-path";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KFC Helper — WoW Forever and TBC Tools",
    short_name: "KFC Helper",
    description:
      "Build-aware World of Warcraft item, recipe, profession, crafting, and Auction House tools.",
    start_url: withHelperBasePath("/"),
    scope: `${withHelperBasePath("/")}/`,
    display: "standalone",
    background_color: "#07090b",
    theme_color: "#c79a50",
    icons: [{ src: withHelperBasePath("/kfc-icon.svg"), sizes: "any", type: "image/svg+xml" }],
  };
}
