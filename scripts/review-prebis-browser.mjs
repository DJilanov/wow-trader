import assert from "node:assert/strict";

export async function assertProcConsentDisabled(page) {
  const observer = await page.evaluateHandle(() => {
    const track = (event) => {
      const modal = event.target;
      if (!(modal instanceof globalThis.HTMLElement) || !modal.querySelector(".selector-modal"))
        return;
      modal.setAttribute(
        "data-kfc-share-modal-state",
        event.type === "shown.bs.modal" ? "shown" : "hidden",
      );
    };
    globalThis.document.addEventListener("shown.bs.modal", track, true);
    globalThis.document.addEventListener("hidden.bs.modal", track, true);
    return () => {
      globalThis.document.removeEventListener("shown.bs.modal", track, true);
      globalThis.document.removeEventListener("hidden.bs.modal", track, true);
      globalThis.document.querySelectorAll("[data-kfc-share-modal-state]").forEach((modal) => {
        modal.removeAttribute("data-kfc-share-modal-state");
      });
    };
  });
  try {
    const weapon = page.locator(".gear-picker-root .item-picker-root").filter({
      has: page.locator(".kfc-slot-label", { hasText: /^Main Hand$/ }),
    });
    await weapon.locator(".item-picker-enchant").click();
    // Bootstrap ignores hide() during its opening transition, even when the button is stable.
    const modal = page
      .locator('.modal[data-kfc-share-modal-state="shown"]')
      .filter({ has: page.locator(".selector-modal") });
    await modal.waitFor({ state: "visible", timeout: 10000 });
    const checkbox = modal.locator(".tab-pane.active .kfc-enchant-optin input");
    assert.equal(
      await checkbox.isChecked(),
      false,
      "Sharing a build must never enable provisional models",
    );
    await modal.locator(".modal-header .btn-close:visible").first().click();
    await page
      .locator('.modal[data-kfc-share-modal-state="hidden"]')
      .filter({ has: page.locator(".selector-modal") })
      .waitFor({ state: "attached", timeout: 10000 });
  } finally {
    await observer.evaluate((cleanup) => cleanup());
    await observer.dispose();
  }
}
