import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";

export async function captureSimulatorRequest(
  root,
  settings,
  {
    release,
    profile,
    iterations = 25,
    seed = 1337,
    allowProvisionalEnchants = false,
    origin = process.env.SIMULATOR_TEST_URL || "http://localhost:3017",
  },
) {
  assert(/^[a-f0-9]{24}$/.test(release), "Invalid simulator release");
  assert(/^[a-z][a-z_]*$/.test(profile), "Invalid simulator page");
  assert(Number.isSafeInteger(iterations) && iterations > 0 && iterations <= 100000);
  assert(Number.isSafeInteger(seed));
  assert.equal(typeof allowProvisionalEnchants, "boolean");
  const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
    "playwright",
  );
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", async (dialog) => {
      errors.push(dialog.message());
      await dialog.dismiss();
    });
    await page.addInitScript(() => {
      globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
      globalThis.__kfcCapturedRequests = [];
      const post = globalThis.Worker.prototype.postMessage;
      globalThis.Worker.prototype.postMessage = function (message, ...rest) {
        if (["raidSim", "raidSimAsync"].includes(message.msg))
          globalThis.__kfcCapturedRequests.push(Array.from(message.inputData));
        return post.call(this, message, ...rest);
      };
    });
    const response = await page.goto(`${origin}/forever-sim/${release}/${profile}/`, {
      waitUntil: "domcontentloaded",
    });
    assert(response?.ok(), "Simulator page did not load");
    const ready = () =>
      page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
    await ready();
    await page.evaluate((value) => {
      const key = Object.keys(globalThis.localStorage).find((key) =>
        key.endsWith("__currentSettings__"),
      );
      if (!key) throw new Error("No saved character storage");
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    }, settings);
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    if (allowProvisionalEnchants) {
      const weapon = page.locator(".gear-picker-root .item-picker-root").filter({
        has: page.locator(".kfc-slot-label", { hasText: /^Main Hand$/ }),
      });
      await weapon.locator(".item-picker-enchant").click();
      const modal = page.locator(".modal.show .selector-modal");
      const checkbox = modal.locator(".tab-pane.active .kfc-enchant-optin input");
      await checkbox.check();
      assert(await checkbox.isChecked(), "Provisional model opt-in was not enabled");
      await modal.locator(".modal-header .btn-close:visible").first().click();
    }
    await page.evaluate(
      ({ iterations, seed }) => {
        for (const [id, value] of [
          ["simui-iterations", String(iterations)],
          ["simui-fixed-rng-seed", String(seed)],
        ]) {
          const input = globalThis.document.getElementById(id);
          if (!input) throw new Error(`Missing simulation control ${id}`);
          input.value = value;
          input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
        }
      },
      { iterations, seed },
    );
    await page.locator(".dps-action").click();
    await page.waitForFunction(
      () =>
        /\d[\d,]*\.\d+/.test(
          globalThis.document.querySelector(".results-content .topline-result-avg")?.textContent ??
            "",
        ) && !globalThis.document.querySelector(".dps-action")?.disabled,
      null,
      { timeout: 90000 },
    );
    const captured = await page.evaluate(() => ({
      bytes: globalThis.__kfcCapturedRequests.at(-1),
      settings: Object.keys(globalThis.localStorage)
        .filter((key) => key.endsWith("__currentSettings__"))
        .map((key) => JSON.parse(globalThis.localStorage.getItem(key)))
        .find((value) => value.player?.equipment),
      metrics: Array.from(
        globalThis.document.querySelectorAll(".results-content .topline-result-avg"),
        (node) => node.textContent,
      ),
    }));
    assert.deepEqual(errors, []);
    assert(captured.bytes?.length > 0, "No real browser combat request captured");
    for (const field of [
      "equipment",
      "talentsString",
      "rotation",
      "race",
      "profession1",
      "profession2",
    ])
      assert.deepEqual(
        captured.settings.player[field],
        settings.player[field],
        `Browser changed ${field}`,
      );
    const browserDps = Number(captured.metrics[0].replaceAll(",", ""));
    assert(Number.isFinite(browserDps) && browserDps > 0, "Invalid browser DPS");
    return {
      requestBase64: Buffer.from(captured.bytes).toString("base64"),
      settings: captured.settings,
      metrics: captured.metrics,
      browserDps,
      provisionalEnchantsEnabled: allowProvisionalEnchants,
    };
  } catch (error) {
    if (errors.length)
      throw new Error(`Browser capture failed: ${errors.join("; ")}`, { cause: error });
    throw error;
  } finally {
    await browser.close();
  }
}
