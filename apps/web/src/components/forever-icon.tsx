"use client";

import { useState } from "react";

interface ForeverIconProps {
  readonly iconKey: string;
  readonly snapshotChecksum: string;
  readonly alt?: string;
  readonly className?: string;
}

export function ForeverIcon({
  iconKey,
  snapshotChecksum,
  alt = "",
  className,
}: ForeverIconProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const classes = ["forever-icon", className].filter(Boolean).join(" ");
  if (failed) {
    return (
      <span aria-label={alt || undefined} className={`${classes} forever-icon-fallback`} role="img">
        {initials(alt || iconKey)}
      </span>
    );
  }

  return (
    <img
      alt={alt}
      className={classes}
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      src={`/api/forever-assets/icon/${encodeURIComponent(iconKey)}?v=${snapshotChecksum.slice(0, 12)}`}
    />
  );
}

function initials(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
