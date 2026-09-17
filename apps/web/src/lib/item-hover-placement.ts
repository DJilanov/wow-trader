export type ItemHoverPlacement = "above" | "below";

interface ItemHoverPlacementInput {
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly tooltipHeight: number;
  readonly viewportHeight: number;
  readonly gap?: number;
  readonly viewportPadding?: number;
}

interface ItemHoverPlacementResult {
  readonly placement: ItemHoverPlacement;
  readonly maxHeight: number;
}

export function getItemHoverPlacement({
  anchorTop,
  anchorBottom,
  tooltipHeight,
  viewportHeight,
  gap = 9,
  viewportPadding = 12,
}: ItemHoverPlacementInput): ItemHoverPlacementResult {
  const availableAbove = Math.max(0, anchorTop - gap - viewportPadding);
  const availableBelow = Math.max(0, viewportHeight - anchorBottom - gap - viewportPadding);
  const placement =
    tooltipHeight > availableAbove && availableBelow > availableAbove ? "below" : "above";
  const availableHeight = placement === "below" ? availableBelow : availableAbove;

  return {
    placement,
    maxHeight: Math.max(0, Math.min(680, viewportHeight * 0.7, availableHeight)),
  };
}
