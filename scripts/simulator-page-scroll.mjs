import assert from "node:assert/strict";

export async function assertSimulatorPageScroll(frame) {
  await frame.waitForFunction(() => {
    const workspace = globalThis.document.querySelector(".sim-ui.kfc-workspace");
    return (
      workspace &&
      globalThis.document.querySelector("[data-kfc-page-scroll]") &&
      globalThis.document.documentElement.scrollHeight <= globalThis.innerHeight + 2 &&
      !["auto", "scroll"].includes(globalThis.getComputedStyle(workspace).overflowY)
    );
  });
  const nested = await frame.evaluate(() =>
    [...globalThis.document.querySelectorAll(".sim-ui.kfc-workspace, .sim-sidebar")]
      .filter(
        (element) =>
          element.clientHeight > 0 &&
          element.scrollHeight > element.clientHeight + 2 &&
          ["auto", "scroll"].includes(globalThis.getComputedStyle(element).overflowY),
      )
      .map((element) => element.className),
  );
  assert.deepEqual(nested, [], "The host page must own simulator scrolling");
}
