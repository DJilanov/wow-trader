import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/forever/trader") }));
vi.mock("next/image", () => ({
  default: (props: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }): React.JSX.Element =>
    createElement("img", {
      src: props.src,
      alt: props.alt,
      width: props.width,
      height: props.height,
    }),
}));

describe("primary product navigation", () => {
  it("uses short Forever tool names and a single TBC Tools destination", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader));
    for (const [label, href] of [
      ["Trader", "/forever/trader"],
      ["Leveling", "/forever/leveling"],
      ["Encyclopedia", "/forever/encyclopedia"],
      ["Simulator", "/forever/simulator"],
      ["TBC Tools", "/tbc"],
    ]) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`>${label}</a>`);
    }
    expect(html).not.toContain(">Forever ");
    expect(html.match(/href="\/tbc(?:\/[^"]*)?"/g)).toHaveLength(1);
  });
  it("marks TBC Tools active while retaining the main tool links to Forever", () => {
    vi.mocked(usePathname).mockReturnValueOnce("/tbc/encyclopedia");
    const html = renderToStaticMarkup(createElement(SiteHeader));
    expect(html).toMatch(
      /aria-current="page"[^>]*href="\/tbc"|href="\/tbc"[^>]*aria-current="page"/,
    );
    expect(html).toContain('href="/forever/trader"');
  });
});
