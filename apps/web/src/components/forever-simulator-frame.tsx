"use client";

import { useEffect, useRef, useState } from "react";
import {
  isSimulatorFrameReady,
  simulatorDialogScrollOffset,
} from "../lib/forever-simulator-frame-state";

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
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [focusError, setFocusError] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const element = frame.current;
    if (!element) return;
    const check = (): void => {
      if (!isSimulatorFrameReady(element, src, window.location.origin)) return;
      setLoaded(true);
      window.clearInterval(poll);
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => setSlow(true), 30000);
    const poll = window.setInterval(check, 250);
    element.addEventListener("load", check);
    // SSR frames can finish loading before React attaches event handlers.
    check();
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      element.removeEventListener("load", check);
    };
  }, [src, attempt]);
  useEffect(() => {
    const element = frame.current;
    const frameDocument = loaded ? element?.contentDocument : null;
    if (!element || !frameDocument) return;
    const revealDialog = (event: Event): void => {
      if (document.fullscreenElement === container.current) return;
      const modal = event.target as HTMLElement | null;
      const heading = modal?.querySelector<HTMLElement>(".modal-header");
      if (!heading) return;
      const offset = simulatorDialogScrollOffset(
        element.getBoundingClientRect().top,
        heading.getBoundingClientRect().top,
        document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0,
        window.innerHeight,
      );
      if (offset !== 0) window.scrollBy({ top: offset, behavior: "instant" });
    };
    // Modal focus can scroll a nested frame's close control behind the host's fixed header.
    frameDocument.addEventListener("shown.bs.modal", revealDialog);
    return () => frameDocument.removeEventListener("shown.bs.modal", revealDialog);
  }, [loaded, src, attempt]);
  useEffect(() => {
    setCanFullscreen(document.fullscreenEnabled);
    const updateFullscreen = (): void => {
      setFullscreen(document.fullscreenElement === container.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);
  useEffect(() => {
    const dismissItemPicker = (): void => {
      frame.current?.contentWindow?.postMessage(
        { type: "kfc-simulator-dismiss-item-picker" },
        window.location.origin,
      );
    };
    document.addEventListener("pointerdown", dismissItemPicker, true);
    return () => document.removeEventListener("pointerdown", dismissItemPicker, true);
  }, []);
  async function toggleFullscreen(): Promise<void> {
    setFocusError(false);
    try {
      if (document.fullscreenElement === container.current) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setFocusError(true);
    }
  }
  return (
    <div className="forever-simulator-frame" ref={container}>
      <div className="simulator-embed-toolbar">
        <span className="simulator-device-label">Runs on your device</span>
        {canFullscreen ? (
          <button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen}>
            {fullscreen ? "Exit focus mode" : "Focus mode"}
          </button>
        ) : null}
        <a href={src} target="_blank" rel="noreferrer">
          Open in new tab ↗
        </a>
      </div>
      {focusError ? (
        <p role="status" className="simulator-focus-error">
          Fullscreen is unavailable. Use “Open in new tab” for a larger workspace.
        </p>
      ) : null}
      {!loaded ? (
        <div role="status" className="simulator-loading">
          <p>
            {slow
              ? "The engine has not finished loading. Retry here or use “Open in new tab”. Your saved builds are kept."
              : "Loading the combat engine…"}
          </p>
          {slow ? (
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Reload engine
            </button>
          ) : null}
        </div>
      ) : null}
      <iframe
        key={`${src}:${attempt}`}
        ref={frame}
        src={src}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"
        allow="clipboard-write"
        allowFullScreen
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
