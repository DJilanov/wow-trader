import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { parseArgs, promisify } from "node:util";
import { pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";
import { verifyStaticDelivery } from "./verify-static-delivery.mjs";

const exec = promisify(execFile);

export async function activateStaticDelivery({
  directory,
  deliveryRoot = "/home/wow-trader-system/shared/static-delivery",
  nginxConfig = "/etc/nginx/sites-enabled/kfcguild.online",
  baseUrl = "https://kfcguild.online",
  run = async (command, args) => exec(command, args),
  verify = verifyStaticDelivery,
}) {
  const root = await realpath(resolve(deliveryRoot)),
    target = await realpath(resolve(directory)),
    offset = relative(join(root, "releases"), target);
  assert(
    offset && !offset.startsWith(".") && !offset.includes("/") && !isAbsolute(offset),
    "Activate only a named verified delivery release",
  );
  const config = await readFile(nginxConfig, "utf8");
  assert(
    config.includes("include " + root + "/current/nginx-*.conf;"),
    "Deploy the compression-aware Nginx configuration before activation",
  );
  const lockPath = join(root, "activation.lock"),
    nonce = randomUUID(),
    lock = await open(lockPath, "wx", 0o600),
    current = join(root, "current"),
    temporary = join(root, ".activate-" + nonce);
  let previous = null,
    switched = false,
    failure,
    result;
  async function currentTarget() {
    try {
      assert((await lstat(current)).isSymbolicLink(), "Delivery current must be a symlink");
      return await readlink(current);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, nonce, target }) + "\n");
    await lock.sync();
    previous = await currentTarget();
    await verify(target);
    assert.equal(await currentTarget(), previous, "Another deployment moved the delivery pointer");
    await symlink(target, temporary);
    await rename(temporary, current);
    switched = true;
    await run("nginx", ["-t"]);
    await run("systemctl", ["reload", "nginx"]);
    await run("systemctl", ["is-active", "--quiet", "nginx"]);
    const publicChecks = await verify(target, { baseUrl });
    const receipt = {
      schema: "kfc-static-delivery-activation.v1",
      status: "active",
      directory: target,
      previous,
      publicChecks,
      activatedAt: new Date().toISOString(),
    };
    await mkdir(join(root, "activations"), { recursive: true });
    await writeFile(
      join(root, "activations", nonce + ".json"),
      JSON.stringify(receipt, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    result = receipt;
  } catch (error) {
    failure = error;
    if (switched) {
      try {
        assert.equal(
          await currentTarget(),
          target,
          "Rollback refuses to overwrite another deployment",
        );
        if (previous === null) await unlink(current);
        else {
          await symlink(previous, temporary);
          await rename(temporary, current);
        }
        await run("nginx", ["-t"]);
        await run("systemctl", ["reload", "nginx"]);
      } catch (rollback) {
        failure = new AggregateError(
          [error, rollback],
          "Static delivery failed and rollback requires operator attention",
        );
      }
    }
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await lock.close();
    const saved = JSON.parse(await readFile(lockPath, "utf8"));
    assert.equal(saved.nonce, nonce, "Activation lock ownership changed");
    await unlink(lockPath);
  }
  if (failure) throw failure;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      directory: { type: "string" },
      "delivery-root": { type: "string" },
      "base-url": { type: "string" },
    },
  });
  assert(values.directory, "--directory is required");
  activateStaticDelivery({
    directory: values.directory,
    deliveryRoot: values["delivery-root"],
    baseUrl: values["base-url"],
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
