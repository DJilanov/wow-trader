export function shouldPrefetchSiteNavigation(href: string, pathname: string): boolean {
  const path = pathname.replace(/^\/tools(?=\/|$)/u, "");
  if (/^\/forever\/(?:simulator|leveling)(?:\/|$)/u.test(path)) return false;
  return !href.endsWith("/trader");
}
