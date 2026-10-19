"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  connectSimulatorFrameNavigation,
  simulatorNavigationHref,
} from "../lib/forever-simulator-frame-navigation";
import { connectSimulatorFrameControls } from "../lib/forever-simulator-frame-controls";
import { connectSimulatorPageScroll } from "../lib/forever-simulator-frame-layout";
import {
  isSimulatorFrameReady,
  simulatorDialogScrollOffset,
} from "../lib/forever-simulator-frame-state";

interface ForeverSimulatorFrameProps {
  readonly src: string;
  readonly title: string;
  readonly onPresetSelected: (name: string) => void;
  readonly onLoadSelectedBuild: (() => void) | undefined;
}
export function ForeverSimulatorFrame({
  src,
  title,
  onPresetSelected,
  onLoadSelectedBuild,
}: ForeverSimulatorFrameProps): React.JSX.Element {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [restarted, setRestarted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [focusError, setFocusError] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const restoreResults = useRef(false);
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
    let timer = window.setTimeout(() => setSlow(true), 30000);
    let poll = window.setInterval(check, 250);
    const onLoad = (): void => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      setLoaded(false);
      setSlow(false);
      setDocumentVersion((value) => value + 1);
      try {
        const actual = element.contentDocument?.location.href;
        const route = actual ? simulatorNavigationHref(actual, src, window.location.origin) : null;
        const expected = simulatorNavigationHref(src.split("#")[0]!, src, window.location.origin);
        if (route && expected && route.split("?")[0] !== expected.split("?")[0])
          router.push(route, { scroll: false });
      } catch {
        // A foreign document cannot drive host navigation; readiness retains its recovery state.
      }
      timer = window.setTimeout(() => setSlow(true), 30000);
      poll = window.setInterval(check, 250);
      check();
    };
    element.addEventListener("load", onLoad);
    // SSR frames can finish loading before React attaches event handlers.
    check();
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      element.removeEventListener("load", onLoad);
    };
  }, [src, attempt, router]);
  useEffect(() => {
    const element = frame.current;
    if (!loaded || !element) return;
    return connectSimulatorFrameNavigation(element, src, {
      onNavigate: (href): void => router.push(href, { scroll: false }),
      onPresetSelected,
    });
  }, [loaded, src, attempt, documentVersion, router, onPresetSelected]);
  useEffect(() => {
    const element = frame.current;
    if (!loaded || fullscreen || !element) return;
    return connectSimulatorPageScroll(element);
  }, [loaded, fullscreen, src, attempt, documentVersion]);
  useEffect(() => {
    const element = frame.current;
    if (!loaded || !element) return;
    if (restoreResults.current) {
      element.contentDocument
        ?.querySelector<HTMLButtonElement>('.kfc-mobile-nav [aria-controls="kfc-simulation-panel"]')
        ?.click();
      restoreResults.current = false;
    }
    return connectSimulatorFrameControls(element, {
      onLoadSelectedBuild,
      onRun: (): void => setRestarted(false),
      onRestart: (url): void => {
        restoreResults.current =
          element.contentDocument?.querySelector<HTMLElement>(".sim-ui")?.dataset.mobileView ===
          "results";
        setRestarted(true);
        setLoaded(false);
        setSlow(false);
        element.contentWindow?.location.replace(url);
      },
    });
  }, [loaded, src, attempt, documentVersion, onLoadSelectedBuild]);
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
  }, [loaded, src, attempt, documentVersion]);
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
      {restarted ? (
        <p role="status" className="simulator-focus-error">
          {loaded
            ? "Run stopped. Results were cleared; your saved character and builds are kept. You can simulate again."
            : "Stopping the busy engine… Your saved character and builds are kept. Results will be cleared."}
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
