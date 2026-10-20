import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { URL } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);

async function repositoryFile(path) {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

test("the apex host owns the Helper base path without replacing guild routes", async () => {
  const [config, nextConfig] = await Promise.all([
    repositoryFile("infra/nginx/kfcguild.online.conf"),
    repositoryFile("apps/web/next.config.ts"),
  ]);

  assert.match(nextConfig, /basePath:\s*["']\/tools["']/);
  assert.match(config, /location = \/tools \{/);
  assert.match(config, /location \/tools\/ \{/);
  assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:19210;/);
  assert.match(config, /location \/ \{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:19200;/);
  assert.match(config, /~\*Googlebot 0;/);
  assert.match(config, /~\*Bingbot 0;/);
});

test("the legacy host preserves ingestion and redirects pages one-to-one", async () => {
  const config = await repositoryFile("infra/nginx/helper.kfcguild.online.conf");

  assert.match(config, /location \/v1\/ \{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:19211;/);
  assert.match(
    config,
    /location \/api\/ \{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:19210\/tools\/api\//,
  );
  assert.match(config, /location = \/ \{\s*return 301 https:\/\/kfcguild\.online\/tools;\s*\}/);
  assert.match(
    config,
    /location \/tools\/ \{\s*return 301 https:\/\/kfcguild\.online\$request_uri;\s*\}/,
  );
  assert.match(
    config,
    /location \/ \{\s*return 301 https:\/\/kfcguild\.online\/tools\$request_uri;\s*\}/,
  );
});

test("immutable simulator bundle URLs still reach Helper after the tools migration", async () => {
  const config = await repositoryFile("infra/nginx/kfcguild.online.conf");
  const location = /location \/forever-sim\/ \{([^}]+)\}/.exec(config)?.[1];
  assert(location, "Published bundles request their original root-relative asset namespace");
  assert.match(location, /proxy_pass http:\/\/127\.0\.0\.1:19210\/tools\/forever-sim\//);
  assert.match(location, /proxy_buffering off;/);
  assert.match(location, /proxy_set_header Host \$host;/);
  assert.doesNotMatch(location, /return 30[1278]/);
});

test("the Nginx deploy activates both hosts and verifies the public migration", async () => {
  const script = await repositoryFile("scripts/deploy-production-nginx.sh");

  assert.match(script, /helper\.kfcguild\.online\.conf/);
  assert.match(script, /kfcguild\.online\.conf/);
  assert.match(script, /https:\/\/kfcguild\.online\/tools\/robots\.txt/);
  assert.match(script, /https:\/\/kfcguild\.online\/tools\/sitemap\.xml/);
  assert.match(script, /https:\/\/helper\.kfcguild\.online\/v1\/uploads\/auction-scan/);
  assert.match(script, /https:\/\/kfcguild\.online\/tools\/forever\/encyclopedia/);
  assert.match(script, /sim_worker\.js lib\.wasm assets\/database\/db\.json/);
  assert.match(script, /https:\/\/kfcguild\.online\/forever-sim\/\$simulator_release/);
});

test("production activation verifies the release label in the standalone runtime", async () => {
  const script = await repositoryFile("scripts/activate-production.sh");

  assert.match(script, /apps\/web\/\.next\/standalone\/apps\/web\/server\.js/);
  assert.doesNotMatch(script, /apps\/web\/\.next\/server["']/);
});

test("standalone packaging copies asset contents and activation requires the topbar logo", async () => {
  const deploy = await repositoryFile("scripts/deploy-production.sh");
  const activate = await repositoryFile("scripts/activate-production.sh");
  assert(
    deploy.includes(
      "rsync -a --delete apps/web/public/ apps/web/.next/standalone/apps/web/public/",
    ),
  );
  assert(
    deploy.includes(
      "rsync -a --delete apps/web/.next/static/ apps/web/.next/standalone/apps/web/.next/static/",
    ),
  );
  assert(activate.includes("apps/web/.next/standalone/apps/web/public/kfc-icon.svg"));
});

test("server-rendered application links cannot escape the Helper base path", async () => {
  const appRoot = new URL("apps/web/src/", repositoryRoot);
  const entries = await readdir(appRoot, { recursive: true, withFileTypes: true });
  const offenders = [];
  const rawInternalAnchor = /<a\b[^>]*\bhref=(?:"\/(?!\/|#)|\{`\/(?!\/|#))/g;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    const absolutePath = join(entry.parentPath, entry.name);
    const contents = await readFile(absolutePath, "utf8");
    if (rawInternalAnchor.test(contents)) offenders.push(absolutePath);
    rawInternalAnchor.lastIndex = 0;
  }

  assert.deepEqual(offenders, []);
});

test("the Helper home advertises the live Forever product", async () => {
  const home = await repositoryFile("apps/web/src/app/page.tsx");

  assert.doesNotMatch(home, /Preparing/);
  assert.match(home, /WoW Forever and TBC tools/);
  assert.match(home, /\/forever\/leveling/);
  assert.match(home, /\/forever\/simulator/);
  assert.match(home, /\/forever\/encyclopedia/);
  assert.match(home, /\/forever\/trader/);
});

test("sitemaps use evidence-backed dates instead of a blanket timestamp", async () => {
  const sitemap = await repositoryFile("apps/web/src/app/sitemap.ts");

  assert.doesNotMatch(sitemap, /staticLastModified/);
  assert.doesNotMatch(sitemap, /2026-09-27T00:00:00\.000Z/);
  assert.match(sitemap, /lastModified: new Date\(WESTFALL_ROUTE\.reviewedAt\)/);
  assert.match(sitemap, /lastModified: catalog\.publishedAt/);
  assert.match(sitemap, /lastModified: approvedItems\.get\(itemId\)/);
});
