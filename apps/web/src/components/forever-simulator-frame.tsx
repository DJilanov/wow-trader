"use client";

import { useEffect, useState } from "react";

interface ForeverSimulatorFrameProps {
  readonly src: string;
  readonly title: string;
}
export function ForeverSimulatorFrame({
  src,
  title,
}: ForeverSimulatorFrameProps): React.JSX.Element {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 30000);
    return () => window.clearTimeout(timer);
  }, [src]);
  return (
    <div className="forever-simulator-frame">
      <p className="simulator-open-link">
        <a href={src} target="_blank" rel="noreferrer">
          Open full-window simulator ↗
        </a>
        <span className="muted"> · Runs on your device</span>
      </p>
      {!loaded ? (
        <p role="status" className="simulator-loading">
          {slow
            ? "The engine is taking longer to load. You can refresh or try opening it in its own tab below."
            : "Loading the combat engine…"}
        </p>
      ) : null}
      <iframe
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"
        allow="clipboard-write"
        referrerPolicy="no-referrer"
      />
      <p className="muted">
        Equipment, talents and encounter controls are inside the simulator.{" "}
        <a href={src} target="_blank" rel="noreferrer">
          Open the simulator in its own tab ↗
        </a>
      </p>
    </div>
  );
}
