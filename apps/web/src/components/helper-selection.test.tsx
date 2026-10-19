import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HelperSelection } from "./helper-selection";

describe("HelperSelection artwork", () => {
  it("keeps both icon and logo source URLs inside the deployed tools application", () => {
    const markup = renderToStaticMarkup(
      <HelperSelection
        eyebrow="WoW Forever"
        title="Tools"
        description="Choose a tool"
        options={[
          {
            title: "Encyclopedia",
            eyebrow: "Database",
            description: "Browse items",
            status: "Available",
            image: { src: "/wow-assets/tools/encyclopedia.jpg", kind: "icon" },
            tone: "encyclopedia",
            href: "/forever/encyclopedia",
          },
          {
            title: "Leveling",
            eyebrow: "Quests",
            description: "Browse chapters",
            status: "Available",
            image: { src: "/tools/wow-assets/games/forever-logo.jpg", kind: "logo" },
            tone: "leveling",
            href: "/forever/leveling",
          },
        ]}
      />,
    );

    const imageTags = markup.match(/<img\b[^>]*>/gu) ?? [];
    expect(imageTags).toHaveLength(2);
    for (const image of imageTags) {
      const source = /\bsrc="([^"]+)"/u.exec(image)?.[1];
      if (!source) throw new Error("Selection artwork has no image source");
      const url = new URL(source, "https://kfcguild.online");
      const sourcePath = url.searchParams.get("url") ?? url.pathname;
      expect(sourcePath).toMatch(/^\/tools\/wow-assets\//u);
      expect(sourcePath).not.toContain("/tools/tools/");
    }
  });
});
