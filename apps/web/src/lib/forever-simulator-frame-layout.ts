import { simulatorFrameViewport } from "./forever-simulator-frame-state";

// Only the embedded document expands. Standalone and fullscreen workspaces keep their own layout.
const pageScrollStyles = `
  html, body:has(.sim-ui.kfc-workspace) {
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
  .sim-ui.kfc-workspace {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .kfc-workspace > .sim-root { min-height: 0 !important; }
  .kfc-workspace-heading,
  .kfc-workspace > .sim-root > .sim-container > .sim-sidebar {
    position: relative !important;
    top: auto !important;
  }
  .kfc-workspace > .sim-root > .sim-container > .sim-sidebar {
    max-height: none !important;
    overflow: visible !important;
  }
  .modal {
    top: var(--kfc-host-viewport-top) !important;
    bottom: auto !important;
    height: var(--kfc-host-viewport-height) !important;
  }
  .modal-dialog-scrollable {
    height: calc(var(--kfc-host-viewport-height) - var(--bs-modal-margin) * 2) !important;
  }
  @media (max-width: 899px) {
    .kfc-workspace .kfc-mobile-nav {
      top: calc(var(--kfc-host-viewport-top) + var(--kfc-host-viewport-height)) !important;
      bottom: auto !important;
      transform: translateY(-100%);
    }
  }
`;

export function connectSimulatorPageScroll(frame: HTMLIFrameElement): () => void {
  const frameDocument = frame.contentDocument;
  const workspace = frameDocument?.querySelector<HTMLElement>(".sim-ui.kfc-workspace");
  if (!frameDocument || !workspace) return () => {};
  const style = frameDocument.createElement("style");
  style.dataset.kfcPageScroll = "true";
  style.textContent = pageScrollStyles;
  frameDocument.head.append(style);
  const originalHeight = frame.style.height;
  const originalMinHeight = frame.style.minHeight;
  frame.style.minHeight = "0";
  const rootStyle = frameDocument.documentElement.style;
  let scheduled: number | null = null;
  const update = (): void => {
    scheduled = null;
    const height = Math.ceil(workspace.getBoundingClientRect().height);
    if (height > 0 && Math.abs(frame.clientHeight - height) > 1) frame.style.height = `${height}px`;
    const bounds = frame.getBoundingClientRect();
    const viewport = simulatorFrameViewport(
      bounds.top,
      bounds.height,
      document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0,
      window.innerHeight,
    );
    rootStyle.setProperty("--kfc-host-viewport-top", `${viewport.top}px`);
    rootStyle.setProperty("--kfc-host-viewport-height", `${viewport.height}px`);
  };
  const schedule = (): void => {
    if (scheduled === null) scheduled = window.requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(workspace);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    if (scheduled !== null) window.cancelAnimationFrame(scheduled);
    style.remove();
    frame.style.height = originalHeight;
    frame.style.minHeight = originalMinHeight;
    rootStyle.removeProperty("--kfc-host-viewport-top");
    rootStyle.removeProperty("--kfc-host-viewport-height");
  };
}
