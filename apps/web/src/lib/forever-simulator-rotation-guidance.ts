export function rotationGuidanceText(text: string): string {
  return text.replace(
    /(MP5)|([A-Za-z,])(\d)/g,
    (
      _match: string,
      resource: string | undefined,
      prefix: string | undefined,
      digit: string | undefined,
    ): string => resource ?? `${prefix} ${digit}`,
  );
}
