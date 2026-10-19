import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ForeverIcon } from "./forever-icon";

describe("ForeverIcon", () => {
  it("requests versioned icons from the tools application, not the guild API", () => {
    const markup = renderToStaticMarkup(
      <ForeverIcon alt="Human" iconKey="race human/male" snapshotChecksum="abcdef1234567890" />,
    );

    expect(markup).toContain(
      'src="/tools/api/forever-assets/icon/race%20human%2Fmale?v=abcdef123456"',
    );
    expect(markup).not.toContain('src="/api/');
  });
});
