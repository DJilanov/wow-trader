export const HELPER_BASE_PATH = "/tools";

export function withHelperBasePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new TypeError(`Helper paths must be root-relative: ${path}`);
  }
  if (path === HELPER_BASE_PATH || path.startsWith(`${HELPER_BASE_PATH}/`)) return path;
  return path === "/" ? HELPER_BASE_PATH : `${HELPER_BASE_PATH}${path}`;
}
