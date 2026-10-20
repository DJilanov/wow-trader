import type { ItemSpec } from "./proto/common.js";
import type { TypedEvent } from "./typed_event.js";
import policy from "./kfc_preset_acquisition.json";

export function installKfcPresetNotice(
  root: HTMLElement,
  equipment: () => readonly ItemSpec[],
  changes: TypedEvent<void>,
): () => void {
  const notice = document.createElement("p");
  notice.className = "kfc-preset-acquisition-warning";
  notice.setAttribute("role", "status");
  notice.style.cssText = "margin:0;padding:14px 24px;color:#edc17b;background:#30251d;border-bottom:1px solid #615039";
  root.prepend(notice);
  const update = (): void => {
    const slotTypes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14];
    const problems = equipment().flatMap((item, slot) => {
      const entry = policy.blockedItems.find((entry) => entry.id === item.id);
      const enchant = policy.blockedEnchants.find(
        (entry) => entry.id === item.enchant && entry.type === slotTypes[slot],
      );
      return [entry?.name, enchant?.name].filter((name): name is string => Boolean(name));
    });
    notice.hidden = problems.length === 0;
    notice.textContent = problems.length
      ? `This saved/custom setup is not pre-raid: ${[...new Set(problems)].join(", ")}. Your character has not been changed. Select an updated Gear Set or Preset Configuration, or use Load build above.`
      : "";
  };
  const listener = changes.on(update);
  update();
  return (): void => {
    listener.dispose();
    notice.remove();
  };
}
