export interface SimulatorFrameViewport {
  readonly top: number;
  readonly height: number;
}

export function simulatorFrameViewport(
  frameTop: number,
  frameHeight: number,
  headerBottom: number,
  viewportHeight: number,
): SimulatorFrameViewport {
  const top = Math.max(0, Math.min(frameHeight, Math.max(0, headerBottom) - frameTop));
  const bottom = Math.max(top, Math.min(frameHeight, viewportHeight - frameTop));
  return { top, height: bottom - top };
}

export function simulatorDialogScrollOffset(
  frameTop: number,
  dialogTop: number,
  headerBottom: number,
  viewportHeight: number,
): number {
  const top = frameTop + dialogTop;
  const visibleTop = Math.max(0, headerBottom) + 16;
  return top < visibleTop || top > viewportHeight - 40 ? top - visibleTop : 0;
}

export function isSimulatorFrameReady(
  frame: HTMLIFrameElement,
  src: string,
  origin: string,
): boolean {
  try {
    const expected = new URL(src, origin);
    if (expected.origin !== origin) return false;
    const document = frame.contentDocument;
    if (!document || document.location.href === "about:blank") return false;
    const actual = new URL(document.location.href);
    if (
      actual.origin !== expected.origin ||
      actual.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "") ||
      actual.search !== expected.search
    )
      return false;
    if (document.querySelector('.sim-ui[data-kfc-initialized="false"]')) return false;
    const initialized = document.querySelector<HTMLElement>('.sim-ui[data-kfc-initialized="true"]');
    if (initialized) return initialized.getClientRects().length > 0;
    const action = document.querySelector<HTMLButtonElement>(".sim-ui .dps-action");
    return Boolean(action && action.getClientRects().length);
  } catch {
    // An inaccessible/navigated frame stays in the visible loading/recovery state.
    return false;
  }
}
