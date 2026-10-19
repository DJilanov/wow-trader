import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ItemIcon } from "./item-icon";

describe("ItemIcon", () => {
  it("requests the icon from the explicitly selected game product", () => {
    const markup = renderToStaticMarkup(
      <ItemIcon fileDataId={7_731_377} product="wow_classic_beta" quality={2} size="large" />,
    );

    expect(markup).toContain('src="/tools/api/item-icons/7731377?product=wow_classic_beta"');
  });

  it("renders a placeholder without requesting media when the catalog has no icon", () => {
    const markup = renderToStaticMarkup(
      <ItemIcon fileDataId={null} product="wow_anniversary" quality={1} />,
    );

    expect(markup).toContain("item-icon-placeholder");
    expect(markup).not.toContain("<img");
  });
});
