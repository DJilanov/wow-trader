import { afterEach, describe, expect, it, vi } from "vitest";
import { connectSimulatorPageScroll } from "./forever-simulator-frame-layout";

afterEach(() => vi.unstubAllGlobals());

function fixture(): {
  readonly frame: HTMLIFrameElement;
  readonly update: (height: number) => void;
  readonly flush: () => void;
  readonly style: {
    readonly dataset: Record<string, string>;
    textContent: string;
    remove: () => void;
  };
  readonly properties: Map<string, string>;
  readonly listeners: Map<string, () => void>;
  readonly disconnect: () => void;
  readonly scheduled: Map<number, FrameRequestCallback>;
} {
  let contentHeight = 1620.4;
  let callback: ResizeObserverCallback;
  let nextFrame = 0;
  const scheduled = new Map<number, FrameRequestCallback>();
  const listeners = new Map<string, () => void>();
  const properties = new Map<string, string>();
  const disconnect = vi.fn();
  const style = { dataset: {}, textContent: "", remove: vi.fn() };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(listener: ResizeObserverCallback) {
        callback = listener;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("window", {
    innerHeight: 1000,
    requestAnimationFrame: (listener: FrameRequestCallback): number => {
      scheduled.set(++nextFrame, listener);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number): void => {
      scheduled.delete(id);
    },
    addEventListener: (event: string, listener: () => void): void => {
      listeners.set(event, listener);
    },
    removeEventListener: (event: string): void => {
      listeners.delete(event);
    },
  });
  vi.stubGlobal("document", {
    querySelector: (): { getBoundingClientRect: () => { bottom: number } } => ({
      getBoundingClientRect: () => ({ bottom: 72 }),
    }),
  });
  const frameStyle = { height: "780px", minHeight: "650px" };
  const frame = {
    style: frameStyle,
    get clientHeight(): number {
      return Number.parseInt(frameStyle.height, 10);
    },
    getBoundingClientRect: (): { top: number; height: number } => ({
      top: -400,
      height: frame.clientHeight,
    }),
    contentDocument: {
      querySelector: (): { getBoundingClientRect: () => { height: number } } => ({
        getBoundingClientRect: () => ({ height: contentHeight }),
      }),
      createElement: () => style,
      head: { append: vi.fn() },
      documentElement: {
        style: {
          setProperty: (key: string, value: string): void => {
            properties.set(key, value);
          },
          removeProperty: (key: string): void => {
            properties.delete(key);
          },
        },
      },
    },
  } as unknown as HTMLIFrameElement;
  return {
    frame,
    style,
    properties,
    listeners,
    disconnect,
    scheduled,
    update: (height: number): void => {
      contentHeight = height;
      callback([], {} as ResizeObserver);
    },
    flush: (): void => {
      for (const [id, listener] of [...scheduled]) {
        scheduled.delete(id);
        listener(0);
      }
    },
  };
}

describe("Simulator page scrolling", () => {
  it("expands to intrinsic content, then grows and shrinks without keeping an inner viewport", () => {
    const test = fixture();
    const stop = connectSimulatorPageScroll(test.frame);
    expect(test.frame.style.height).toBe("1621px");
    expect(test.frame.style.minHeight).toBe("0");
    expect(test.style.dataset).toEqual({ kfcPageScroll: "true" });
    expect(test.style.textContent).toContain("overflow: visible !important");
    test.update(2200);
    test.update(1800);
    expect(test.scheduled.size).toBe(1);
    test.flush();
    expect(test.frame.style.height).toBe("1800px");
    test.update(700);
    test.flush();
    expect(test.frame.style.height).toBe("700px");
    stop();
  });

  it("anchors modals in the host viewport and refreshes their position on scrolling or resizing", () => {
    const test = fixture();
    const stop = connectSimulatorPageScroll(test.frame);
    expect(test.properties.get("--kfc-host-viewport-top")).toBe("472px");
    expect(test.properties.get("--kfc-host-viewport-height")).toBe("928px");
    test.listeners.get("scroll")!();
    test.listeners.get("resize")!();
    expect(test.scheduled.size).toBe(1);
    test.flush();
    stop();
  });

  it("keeps the mobile Build/Results switch in the host viewport, not below the expanded frame", () => {
    const test = fixture();
    const stop = connectSimulatorPageScroll(test.frame);
    expect(test.style.textContent).toContain(".kfc-workspace .kfc-mobile-nav");
    expect(test.style.textContent).toContain(
      "top: calc(var(--kfc-host-viewport-top) + var(--kfc-host-viewport-height))",
    );
    expect(test.style.textContent).toContain("transform: translateY(-100%)");
    stop();
  });

  it("restores the original frame on cleanup, cancels pending work and disconnects listeners", () => {
    const test = fixture();
    const stop = connectSimulatorPageScroll(test.frame);
    test.update(3000);
    stop();
    expect(test.frame.style.height).toBe("780px");
    expect(test.frame.style.minHeight).toBe("650px");
    expect(test.disconnect).toHaveBeenCalledOnce();
    expect(test.style.remove).toHaveBeenCalledOnce();
    expect(test.scheduled.size).toBe(0);
    expect(test.listeners.size).toBe(0);
    expect(test.properties.size).toBe(0);
  });

  it("leaves unavailable or non-workspace frames untouched", () => {
    expect(
      connectSimulatorPageScroll({ contentDocument: null } as HTMLIFrameElement)(),
    ).toBeUndefined();
    const test = fixture();
    test.frame.contentDocument!.querySelector = (() => null) as Document["querySelector"];
    connectSimulatorPageScroll(test.frame)();
    expect(test.frame.style.height).toBe("780px");
    expect(test.style.remove).not.toHaveBeenCalled();
  });
});
