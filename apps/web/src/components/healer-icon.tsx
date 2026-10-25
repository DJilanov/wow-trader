"use client";

import { useState } from "react";
export function HealerIcon({ name }: { readonly name: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="forever-icon forever-icon-fallback" aria-hidden="true">
      ?
    </span>
  ) : (
    <img
      className="forever-icon"
      alt=""
      loading="lazy"
      decoding="async"
      src={
        "https://wow.zamimg.com/images/wow/icons/large/" +
        encodeURIComponent(name.toLowerCase()) +
        ".jpg"
      }
      onError={(): void => setFailed(true)}
    />
  );
}
