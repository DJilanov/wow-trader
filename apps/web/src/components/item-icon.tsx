interface ItemIconProps {
  readonly fileDataId: number | null;
  readonly quality: number;
  readonly size?: "small" | "medium" | "large";
}

export function ItemIcon({
  fileDataId,
  quality,
  size = "medium",
}: ItemIconProps): React.JSX.Element {
  const safeQuality = Math.max(0, Math.min(7, quality));
  const pixels = size === "small" ? 24 : size === "large" ? 64 : 42;
  return (
    <span
      className={`item-icon item-icon-${size} quality-border-${safeQuality}`}
      aria-hidden="true"
    >
      {fileDataId ? (
        <img
          src={`/api/item-icons/${fileDataId}`}
          alt=""
          width={pixels}
          height={pixels}
          loading={size === "large" ? "eager" : "lazy"}
        />
      ) : (
        <span className="item-icon-placeholder">?</span>
      )}
    </span>
  );
}
