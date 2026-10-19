import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";

/** @param {string[]} pages @returns {Promise<{pages: number, assets: number}>} */
export async function verifySiteAssets(pages) {
  const assets = new Map();
  for (const page of pages) {
    const pageUrl = new URL(page);
    if (!["http:", "https:"].includes(pageUrl.protocol) || pageUrl.username || pageUrl.password) {
      throw new Error(`Unsupported page URL: ${page}`);
    }
    const response = await globalThis.fetch(pageUrl, {
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Page HTTP ${response.status}: ${page}`);
    const html = await response.text();
    let pageAssets = 0;
    for (const match of html.matchAll(/<(img|script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gu)) {
      const asset = new URL(match[2].replaceAll("&amp;", "&"), response.url);
      if (asset.origin !== pageUrl.origin) continue;
      const contentType = match[1] === "img" ? /^image\//iu : expectedContentType(asset.pathname);
      if (!contentType) continue;
      assets.set(asset.href, contentType);
      pageAssets++;
    }
    if (pageAssets === 0) throw new Error(`No page assets discovered: ${page}`);
  }
  const pending = [...assets];
  const failures = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (cursor < pending.length) {
        const [url, expectedType] = pending[cursor++];
        try {
          const response = await globalThis.fetch(url, {
            signal: globalThis.AbortSignal.timeout(30_000),
          });
          const contentType = response.headers.get("content-type") ?? "";
          await response.arrayBuffer();
          if (!response.ok || !expectedType.test(contentType)) {
            failures.push(`HTTP ${response.status} ${contentType}: ${url}`);
          }
        } catch (error) {
          failures.push(`${String(error)}: ${url}`);
        }
      }
    }),
  );
  if (failures.length > 0) {
    throw new Error(`${failures.length} page assets failed:\n${failures.join("\n")}`);
  }
  return { pages: pages.length, assets: assets.size };
}

/** @param {string} pathname @returns {RegExp | null} */
function expectedContentType(pathname) {
  if (
    pathname.endsWith("/_next/image") ||
    /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/iu.test(pathname)
  ) {
    return /^image\//iu;
  }
  if (/\.css$/u.test(pathname)) return /^text\/css\b/iu;
  if (/\.js$/u.test(pathname)) return /^(?:text|application)\/javascript\b/iu;
  if (/\.woff2?$/u.test(pathname)) return /^(?:font\/|application\/(?:font|x-font|octet-stream))/iu;
  return null;
}

if (
  process.argv[1] &&
  pathToFileURL(await realpath(resolve(process.argv[1]))).href === import.meta.url
) {
  const pages = process.argv.slice(2);
  try {
    const result = await verifySiteAssets(
      pages.length > 0
        ? pages
        : [
            "https://kfcguild.online/",
            "https://kfcguild.online/tools",
            "https://kfcguild.online/tools/forever",
          ],
    );
    process.stdout.write(`${JSON.stringify({ ...result, verified: true })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  }
}
