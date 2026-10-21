import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  symlink,
  lstat,
  rm,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { activateStaticDelivery } from "./activate-static-delivery.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kfc-delivery-activation-test-"));
  const { realpath } = await import("node:fs/promises");
  const canonical = await realpath(root),
    target = join(canonical, "releases/new"),
    previous = join(canonical, "releases/old"),
    config = join(canonical, "nginx.conf");
  await mkdir(target, { recursive: true });
  await mkdir(previous);
  await symlink(previous, join(root, "current"));
  await writeFile(config, "include " + canonical + "/current/nginx-*.conf;");
  return { root: canonical, target, previous, config };
}
test("delivery activation validates before switching, reloads only Nginx and records actual public verification", async () => {
  const f = await fixture();
  try {
    const calls = [],
      verifications = [];
    const receipt = await activateStaticDelivery({
      directory: f.target,
      deliveryRoot: f.root,
      nginxConfig: f.config,
      run: async (...args) => {
        calls.push(args);
      },
      verify: async (path, options) => {
        verifications.push({ path, options });
        return { status: "test-verifier", http: options ? [{ gzip: true }] : [] };
      },
    });
    assert.equal(receipt.status, "active");
    assert.equal(receipt.previous, f.previous);
    assert.equal(await readlink(join(f.root, "current")), f.target);
    assert.deepEqual(calls, [
      ["nginx", ["-t"]],
      ["systemctl", ["reload", "nginx"]],
      ["systemctl", ["is-active", "--quiet", "nginx"]],
    ]);
    assert.equal(verifications.length, 2);
    await assert.rejects(lstat(join(f.root, "activation.lock")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("a public verification failure restores the exact old pointer and reloads the previous configuration", async () => {
  const f = await fixture();
  try {
    const calls = [];
    await assert.rejects(
      activateStaticDelivery({
        directory: f.target,
        deliveryRoot: f.root,
        nginxConfig: f.config,
        run: async (...args) => {
          calls.push(args);
        },
        verify: async (path, options) => {
          if (options) throw new Error("synthetic HTTP verification failure");
          return { status: "local-fixture-pass" };
        },
      }),
      /synthetic HTTP verification failure/,
    );
    assert.equal(await readlink(join(f.root, "current")), f.previous);
    assert.deepEqual(calls.slice(-2), [
      ["nginx", ["-t"]],
      ["systemctl", ["reload", "nginx"]],
    ]);
    await assert.rejects(lstat(join(f.root, "activation.lock")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("outside targets, absent edge configuration and an owned activation lock fail without running service commands", async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const options = {
      directory: f.target,
      deliveryRoot: f.root,
      nginxConfig: f.config,
      run: async () => {
        calls++;
      },
      verify: async () => ({ status: "unused" }),
    };
    await assert.rejects(
      activateStaticDelivery({ ...options, directory: f.root }),
      /named verified delivery/,
    );
    await writeFile(f.config, "old configuration");
    await assert.rejects(activateStaticDelivery(options), /Deploy the compression-aware/);
    await writeFile(f.config, "include " + f.root + "/current/nginx-*.conf;");
    await writeFile(join(f.root, "activation.lock"), "existing owner");
    await assert.rejects(activateStaticDelivery(options), { code: "EEXIST" });
    assert.equal(await readFile(join(f.root, "activation.lock"), "utf8"), "existing owner");
    assert.equal(calls, 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Nginx syntax failure on a first activation removes the new pointer and restores the empty include", async () => {
  const f = await fixture();
  try {
    await unlink(join(f.root, "current"));
    const calls = [];
    await assert.rejects(
      activateStaticDelivery({
        directory: f.target,
        deliveryRoot: f.root,
        nginxConfig: f.config,
        verify: async () => ({ status: "test-verifier" }),
        run: async (command, args) => {
          calls.push([command, args]);
          if (calls.length === 1) throw new Error("synthetic Nginx syntax failure");
        },
      }),
      /synthetic Nginx syntax failure/,
    );
    await assert.rejects(lstat(join(f.root, "current")), { code: "ENOENT" });
    await assert.rejects(lstat(join(f.root, "activation.lock")), { code: "ENOENT" });
    assert.deepEqual(calls, [
      ["nginx", ["-t"]],
      ["nginx", ["-t"]],
      ["systemctl", ["reload", "nginx"]],
    ]);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a regular current file is preserved and cannot be overwritten by activation", async () => {
  const f = await fixture();
  try {
    const current = join(f.root, "current");
    await unlink(current);
    await writeFile(current, "operator-owned file");
    let calls = 0;
    await assert.rejects(
      activateStaticDelivery({
        directory: f.target,
        deliveryRoot: f.root,
        nginxConfig: f.config,
        verify: async () => ({ status: "test-verifier" }),
        run: async () => {
          calls++;
        },
      }),
      /must be a symlink/,
    );
    assert.equal(await readFile(current, "utf8"), "operator-owned file");
    assert.equal(calls, 0);
    await assert.rejects(lstat(join(f.root, "activation.lock")), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
