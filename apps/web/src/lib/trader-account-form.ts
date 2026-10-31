export function goldInputToCopper(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(text))
    throw new Error("Enter gold with up to four decimal places.");
  const [whole, fraction = ""] = text.split(".");
  return (BigInt(whole!) * 10_000n + BigInt(fraction.padEnd(4, "0"))).toString();
}
export function copperInputValue(value: string | null): string {
  if (value === null) return "";
  const copper = BigInt(value);
  return `${copper / 10_000n}.${(copper % 10_000n).toString().padStart(4, "0")}`;
}
