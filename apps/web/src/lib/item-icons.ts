import path from "node:path";

export function resolveItemIconPath(mediaRoot: string, fileDataIdValue: string): string | null {
  if (!path.isAbsolute(mediaRoot) || !/^[1-9][0-9]{0,9}$/u.test(fileDataIdValue)) return null;
  const fileDataId = Number(fileDataIdValue);
  if (!Number.isSafeInteger(fileDataId)) return null;
  return path.join(mediaRoot, `${fileDataId}.png`);
}
