import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assertProcConsentDisabled } from "./review-prebis-browser.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..");
const tool = resolve(directory, "review-prebis-build.mjs");
const campaignAvailable = existsSync(
  resolve(root, "artifacts/forever-simulator/optimization/campaigns/latest.json"),
);
function rejects(args, expected) {
  assert.throws(
    () => execFileSync(process.execPath, [tool, ...args], { cwd: root, stdio: "pipe" }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), expected);
      return true;
    },
  );
}

test("rejects unsupported flags without opening a browser", () => {
  rejects(["--case=arms-alliance", "--force-final"], /Pass --case=/);
});

test("rejects duplicate case selection", () => {
  rejects(["--case=arms-alliance", "--case=arms-alliance"], /Pass --case=/);
});

test("rejects an unknown case before browser launch", { skip: !campaignAvailable }, () => {
  rejects(["--case=not-a-campaign-case", "--allow-pending"], /Unknown or not-yet-started/);
});

test(
  "unfinished campaign cases cannot be exported as final reviews",
  { skip: !campaignAvailable },
  (t) => {
    const base = resolve(root, "artifacts/forever-simulator/optimization/campaigns");
    const latest = JSON.parse(readFileSync(resolve(base, "latest.json"), "utf8"));
    assert.match(latest.identity, /^[a-f0-9]{64}$/);
    const state = JSON.parse(readFileSync(resolve(base, latest.identity, "state.json"), "utf8"));
    const entry = Object.values(state.cases).find((value) => value.status !== "reviewed-local");
    if (!entry) {
      t.skip("Every started case is already reviewed; there is no real unfinished case to inspect");
      return;
    }
    rejects([`--case=${entry.entry.id}`], /Final audits are unfinished/);
  },
);

test("preview mode still requires completed core feedback", { skip: !campaignAvailable }, (t) => {
  const base = resolve(root, "artifacts/forever-simulator/optimization/campaigns");
  const latest = JSON.parse(readFileSync(resolve(base, "latest.json"), "utf8"));
  assert.match(latest.identity, /^[a-f0-9]{64}$/);
  const state = JSON.parse(readFileSync(resolve(base, latest.identity, "state.json"), "utf8"));
  const entry = Object.values(state.cases).find(
    (value) =>
      value.status !== "reviewed-local" && !value.steps.some((step) => step.kind === "feedback"),
  );
  if (!entry) {
    t.skip("No real started case is awaiting its first core review");
    return;
  }
  rejects([`--case=${entry.entry.id}`, "--allow-pending"], /Core feedback is unfinished/);
});

test(
  "proc consent inspection waits for real Bootstrap transitions and never changes consent",
  { skip: !existsSync(resolve(root, ".cache/forever-sim-upstream/package.json")) },
  async (t) => {
    const require = createRequire(resolve(root, ".cache/forever-sim-upstream/package.json"));
    const { chromium } = require("playwright");
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
    });
    const fixture = async (checked = false) => {
      const page = await browser.newPage();
      await page.setContent(`
        <div class="gear-picker-root"><div class="item-picker-root">
          <span class="kfc-slot-label">Main Hand</span>
          <button class="item-picker-enchant">Change enchant</button>
        </div></div>
        <div class="modal fade" tabindex="-1">
          <div class="modal-dialog selector-modal"><div class="modal-content">
            <div class="modal-header"><button class="btn-close" aria-label="Close"></button></div>
            <div class="modal-body tab-pane active"><label class="kfc-enchant-optin">
              <input type="checkbox" ${checked ? "checked" : ""}>Allow provisional models
            </label></div>
          </div></div>
        </div>
      `);
      await page.addStyleTag({ path: require.resolve("bootstrap/dist/css/bootstrap.css") });
      await page.addStyleTag({
        content:
          ".modal-dialog { transform: none !important; transition: opacity 0.8s linear !important; } .modal.fade .modal-dialog { opacity: 0.5; } .modal.show .modal-dialog { opacity: 1; }",
      });
      await page.addScriptTag({ path: require.resolve("bootstrap/dist/js/bootstrap.bundle.js") });
      await page.evaluate(() => {
        const root = globalThis.document.querySelector(".modal");
        const modal = new globalThis.bootstrap.Modal(root);
        root.addEventListener("shown.bs.modal", () => (root.dataset.shown = "true"));
        root.addEventListener("hidden.bs.modal", () => (root.dataset.hidden = "true"));
        globalThis.document
          .querySelector(".item-picker-enchant")
          .addEventListener("click", () => modal.show());
        root.querySelector(".btn-close").addEventListener("click", () => {
          root.dataset.closedBeforeShown = String(root.dataset.shown !== "true");
          modal.hide();
        });
      });
      return page;
    };
    try {
      await t.test("old immediate-close sequence leaves the opening dialog stuck", async () => {
        const page = await fixture();
        try {
          await page.locator(".item-picker-enchant").click();
          const modal = page.locator(".modal.show .selector-modal");
          assert.equal(await modal.locator(".kfc-enchant-optin input").isChecked(), false);
          await modal.locator(".btn-close").click();
          await page.locator('.modal[data-shown="true"]').waitFor();
          assert.equal(
            await page.locator(".modal").getAttribute("data-closed-before-shown"),
            "true",
          );
          assert.equal(await page.locator(".modal.show").count(), 1);
        } finally {
          await page.close();
        }
      });
      await t.test("review helper waits for shown and hidden without enabling models", async () => {
        const page = await fixture();
        try {
          await assertProcConsentDisabled(page);
          assert.equal(await page.locator(".modal.show").count(), 0);
          assert.equal(await page.locator(".modal").getAttribute("data-hidden"), "true");
          assert.equal(
            await page.locator(".modal").getAttribute("data-closed-before-shown"),
            "false",
          );
          assert.equal(await page.locator(".kfc-enchant-optin input").isChecked(), false);
          assert.equal(await page.locator("[data-kfc-share-modal-state]").count(), 0);
        } finally {
          await page.close();
        }
      });
      await t.test("unexpected consent fails instead of silently resetting it", async () => {
        const page = await fixture(true);
        try {
          await assert.rejects(
            assertProcConsentDisabled(page),
            /must never enable provisional models/,
          );
          assert.equal(await page.locator(".kfc-enchant-optin input").isChecked(), true);
          assert.equal(await page.locator("[data-kfc-share-modal-state]").count(), 0);
        } finally {
          await page.close();
        }
      });
    } finally {
      await browser.close();
    }
  },
);
