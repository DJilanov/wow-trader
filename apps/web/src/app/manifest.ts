import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KFC Helper — WoW Forever and TBC Tools",
    short_name: "KFC Helper",
    description:
      "Build-aware World of Warcraft item, recipe, profession, crafting, and Auction House tools.",
    start_url: "/",
    display: "standalone",
    background_color: "#07090b",
    theme_color: "#c79a50",
    icons: [{ src: "/kfc-icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
