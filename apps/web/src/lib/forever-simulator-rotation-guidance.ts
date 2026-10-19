export function rotationGuidanceText(text: string): string {
  return text.replace(/([A-Za-z,])(\d)/g, "$1 $2");
}
