"use client";

import { useEffect, useRef } from "react";

import { getItemHoverPlacement } from "../lib/item-hover-placement";
import type { ItemTooltipRecord } from "../lib/item-tooltip";
import { ItemTooltipContent } from "./item-tooltip";

interface ItemHoverTooltipProps {
  readonly id: string;
  readonly item: ItemTooltipRecord;
}

export function ItemHoverTooltip({ id, item }: ItemHoverTooltipProps): React.JSX.Element {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tooltip = tooltipRef.current;
    const result = tooltip?.parentElement;
    const anchor = result?.querySelector<HTMLElement>(".encyclopedia-item-card");
    if (!tooltip || !result || !anchor) return;

    const updatePlacement = (): void => {
      if (window.matchMedia("(max-width: 580px)").matches) {
        tooltip.style.removeProperty("max-height");
        return;
      }
      const anchorBounds = anchor.getBoundingClientRect();
      const result = getItemHoverPlacement({
        anchorTop: anchorBounds.top,
        anchorBottom: anchorBounds.bottom,
        tooltipHeight: tooltip.scrollHeight,
        viewportHeight: window.innerHeight,
      });
      tooltip.dataset.placement = result.placement;
      tooltip.style.maxHeight = `${result.maxHeight}px`;
    };

    result.addEventListener("pointerenter", updatePlacement);
    result.addEventListener("focusin", updatePlacement);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      result.removeEventListener("pointerenter", updatePlacement);
      result.removeEventListener("focusin", updatePlacement);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, []);

  return (
    <div
      className="encyclopedia-item-popover"
      data-placement="above"
      id={id}
      ref={tooltipRef}
      role="tooltip"
    >
      <ItemTooltipContent
        item={item}
        viewerClassId={null}
        viewerLevel={null}
        linkSetMembers={false}
        usePageHeading={false}
      />
    </div>
  );
}
