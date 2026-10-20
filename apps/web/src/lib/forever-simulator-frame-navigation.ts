import { SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import { withHelperBasePath } from "./site-path";

export function simulatorBuildQuery(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 200 ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return "";
  return `?${new URLSearchParams({ build: value })}`;
}

export function simulatorNavigationHref(href: string, src: string, origin: string): string | null {
  try {
    const current = new URL(src, origin);
    const target = new URL(href, current);
    const pattern = /^\/(?:tools\/)?forever-sim\/([a-f0-9]{24})\/([a-z_]+)\/?$/;
    const source = pattern.exec(current.pathname);
    const destination = pattern.exec(target.pathname);
    if (
      current.origin !== origin ||
      target.origin !== origin ||
      target.username ||
      target.password ||
      !source ||
      !destination ||
      source[1] !== destination[1] ||
      target.hash ||
      [...target.searchParams.keys()].some((key) => key !== "build") ||
      target.searchParams.getAll("build").length > 1
    )
      return null;
    const spec = SIMULATOR_SPECS.find((entry) => entry.page === destination[2]);
    if (!spec) return null;
    const query = simulatorBuildQuery(target.searchParams.get("build"));
    if (target.search && !query) return null;
    return `/forever/simulator/${spec.slug}${query}`;
  } catch {
    return null;
  }
}

export type SimulatorPresetSelectionSource = "initial" | "user";

interface SimulatorFrameNavigationOptions {
  readonly onNavigate: (href: string) => void;
  readonly onPresetSelected?: (name: string, source: SimulatorPresetSelectionSource) => void;
}

export function connectSimulatorFrameNavigation(
  frame: HTMLIFrameElement,
  src: string,
  options: SimulatorFrameNavigationOptions,
): () => void {
  const document = frame.contentDocument;
  const origin = frame.ownerDocument.location.origin;
  if (!document) return () => {};
  const style = document.createElement("style");
  style.textContent = `
    @media (max-width: 899px) {
      .sim-title-dropdown-root .dropdown-menu {
        position: static !important;
        inset: auto !important;
        transform: none !important;
        float: none;
        width: 100%;
        min-width: 0;
        margin: 12px 0 !important;
      }
      .sim-title-dropdown-root .dropend > .dropdown-menu { padding-left: 12px; }
    }
  `;
  document.head.append(style);
  const toggles = new Map<HTMLElement, string | null>();
  for (const toggle of document.querySelectorAll<HTMLElement>(
    '.sim-title-dropdown-root [data-bs-toggle="dropdown"]',
  )) {
    toggles.set(toggle, toggle.getAttribute("data-bs-trigger"));
    // Hover opens upstream submenus before a click immediately closes them, including on touch.
    toggle.dataset.bsTrigger = "click";
  }
  const links = new Map<
    HTMLAnchorElement,
    { href: string; target: string | null; rel: string | null; route: string }
  >();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    ".sim-title-dropdown-root a[href]",
  )) {
    const href = anchor.getAttribute("href")!;
    const route = simulatorNavigationHref(href, src, origin);
    if (!route) continue;
    links.set(anchor, {
      href,
      target: anchor.getAttribute("target"),
      rel: anchor.getAttribute("rel"),
      route,
    });
    // Copies and modified clicks must also open the shareable host page, never a detached engine.
    anchor.href = withHelperBasePath(route);
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  const click = (event: MouseEvent): void => {
    const target = event.target;
    if (!target || !("closest" in target) || typeof target.closest !== "function") return;
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    const link = anchor ? links.get(anchor) : undefined;
    if (
      link &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      options.onNavigate(link.route);
      return;
    }
    const chip = target.closest(
      ".preset-configuration-picker-root button.saved-data-set-chip",
    ) as HTMLButtonElement | null;
    if (!chip || chip.disabled || event.button !== 0) return;
    const label = chip.querySelector<HTMLElement>(".saved-data-set-name");
    if (!label) return;
    // Upstream binds only the inner span: padding and keyboard clicks on the button were inert.
    if (target.closest(".saved-data-set-name") !== label) {
      event.preventDefault();
      label.click();
      return;
    }
    options.onPresetSelected?.(label.textContent?.trim() ?? "", "user");
  };
  document.addEventListener("click", click, true);
  const keepClickMenuOpen = (event: Event): void => {
    const target = event.target;
    if (
      target &&
      "closest" in target &&
      typeof target.closest === "function" &&
      target.closest(".sim-title-dropdown-root")
    )
      event.stopPropagation();
  };
  // Upstream also dismisses menus on mouseleave, even when their trigger is configured for clicks.
  document.addEventListener("mouseleave", keepClickMenuOpen, true);
  const dismissMenus = (): void => {
    const open = document.querySelectorAll<HTMLElement>(
      '.sim-title-dropdown-root [data-bs-toggle="dropdown"][aria-expanded="true"]',
    );
    for (const toggle of [...open].reverse()) toggle.click();
  };
  frame.ownerDocument.addEventListener("pointerdown", dismissMenus, true);
  if (!new URL(src, origin).hash && !new URL(src, origin).search) {
    const active = [
      ...document.querySelectorAll<HTMLElement>(
        ".preset-configuration-picker-root .active .saved-data-set-name",
      ),
    ].find((label) => label.getClientRects().length > 0);
    const name = active?.textContent?.trim();
    if (name) options.onPresetSelected?.(name, "initial");
  }
  return () => {
    document.removeEventListener("click", click, true);
    document.removeEventListener("mouseleave", keepClickMenuOpen, true);
    frame.ownerDocument.removeEventListener("pointerdown", dismissMenus, true);
    style.remove();
    for (const [toggle, trigger] of toggles) {
      if (trigger === null) toggle.removeAttribute("data-bs-trigger");
      else toggle.setAttribute("data-bs-trigger", trigger);
    }
    for (const [anchor, original] of links) {
      anchor.setAttribute("href", original.href);
      for (const name of ["target", "rel"] as const) {
        const value = original[name];
        if (value === null) anchor.removeAttribute(name);
        else anchor.setAttribute(name, value);
      }
    }
  };
}
