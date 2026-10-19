import { withHelperBasePath } from "./site-path";

interface SimulatorFrameControlsOptions {
  readonly onRestart: (url: string) => void;
  readonly onRun: () => void;
  readonly onLoadSelectedBuild?: (() => void) | undefined;
}

export const simulatorStopGraceMs = 1200;

export function simulatorRestartUrl(currentUrl: string, hostOrigin: string): string | null {
  try {
    const url = new URL(currentUrl);
    if (
      url.origin !== hostOrigin ||
      url.username !== "" ||
      url.password !== "" ||
      !/^\/(?:tools\/)?forever-sim\/[a-f0-9]{24}\/[a-z_]+\/?$/.test(url.pathname)
    )
      return null;
    // Re-importing the original share would overwrite edits made since loading that build.
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

const controlStyles = `
  .kfc-frame-race { margin-bottom: 16px; }
  .kfc-frame-race .input-root { width: 100%; margin: 0; }
  .kfc-frame-race select { width: 100%; }
  .kfc-frame-race p, .kfc-frame-notice p {
    margin: 8px 0; color: #c8c3bc; font-size: 12px; line-height: 1.5;
  }
  .kfc-frame-race a { color: #e6bd80; }
  .kfc-frame-notice {
    padding: 12px; margin-bottom: 14px; border: 1px solid #ae8150;
    border-radius: 8px; background: #30251d; overflow-wrap: anywhere;
  }
  .kfc-frame-notice[hidden] { display: none; }
  .kfc-frame-notice strong { color: #f2d7b0; }
  .kfc-frame-notice .btn { white-space: normal; margin: 4px 8px 0 0; }
`;

export function connectSimulatorFrameControls(
  frame: HTMLIFrameElement,
  options: SimulatorFrameControlsOptions,
): () => void {
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  const hostWindow = frame.ownerDocument.defaultView;
  const actions = frameDocument?.querySelector<HTMLElement>(".sim-sidebar-actions");
  if (!frameDocument || !frameWindow || !hostWindow || !actions) return () => {};

  const style = frameDocument.createElement("style");
  style.textContent = controlStyles;
  frameDocument.head.append(style);

  const race = frameDocument.querySelector<HTMLSelectElement>("#player-race");
  const raceControl = race?.closest<HTMLElement>(".input-root");
  const racePlaceholder = frameDocument.createComment("Race control original position");
  const racePanel = frameDocument.createElement("div");
  racePanel.className = "kfc-frame-race";
  if (race && raceControl) {
    raceControl.before(racePlaceholder);
    racePanel.append(raceControl);
    const hint = frameDocument.createElement("p");
    hint.id = "kfc-frame-race-help";
    hint.textContent =
      "Racial bonuses apply automatically. Changing race keeps your gear; faction-locked items must match. ";
    const source = frameDocument.createElement("a");
    source.href = withHelperBasePath("/forever/encyclopedia/racials");
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = "Racial abilities ↗";
    hint.append(source);
    racePanel.append(hint);
    actions.prepend(racePanel);
  }
  const originalDescription = race?.getAttribute("aria-describedby") ?? null;
  if (raceControl && race)
    race.setAttribute(
      "aria-describedby",
      [originalDescription, "kfc-frame-race-help"].filter(Boolean).join(" "),
    );

  const notice = frameDocument.createElement("div");
  notice.className = "kfc-frame-notice";
  notice.hidden = true;
  const message = frameDocument.createElement("div");
  message.setAttribute("role", "alert");
  const heading = frameDocument.createElement("strong");
  heading.textContent = "Check your setup";
  const detail = frameDocument.createElement("p");
  message.append(heading, detail);
  const chooseRace = frameDocument.createElement("button");
  chooseRace.type = "button";
  chooseRace.className = "btn";
  chooseRace.textContent = "Choose race";
  const focusRace = (): void => race?.focus();
  chooseRace.addEventListener("click", focusRace);
  const loadBuild = frameDocument.createElement("button");
  loadBuild.type = "button";
  loadBuild.className = "btn";
  loadBuild.textContent = "Load full tested build";
  const applySelectedBuild = (): void => options.onLoadSelectedBuild?.();
  loadBuild.addEventListener("click", applySelectedBuild);
  const dismiss = frameDocument.createElement("button");
  dismiss.type = "button";
  dismiss.className = "btn";
  dismiss.textContent = "Dismiss notice";
  const hideNotice = (): void => {
    notice.hidden = true;
  };
  dismiss.addEventListener("click", hideNotice);
  frameDocument.addEventListener("change", hideNotice);
  notice.append(message, chooseRace, loadBuild, dismiss);
  actions.prepend(notice);

  const originalAlert = frameWindow.alert;
  const showNotice = (value?: unknown): void => {
    const text = String(value ?? "");
    heading.textContent = /different faction/i.test(text)
      ? "Race and gear do not match"
      : "Simulation notice";
    detail.textContent = text;
    chooseRace.hidden = !race || !/different faction/i.test(text);
    loadBuild.hidden = !options.onLoadSelectedBuild || !/different faction/i.test(text);
    if (!loadBuild.hidden)
      detail.append(
        " Choose a compatible race or load the full tested build, which replaces your current setup including race and encounter settings.",
      );
    notice.hidden = false;
    notice.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  // Native alerts are suppressed inside our sandbox. Keep validation intact and render its message.
  frameWindow.alert = showNotice;

  let pendingStop: { readonly button: Element; readonly timer: number } | undefined;
  const requestStop = (event: Event): void => {
    const target = event.target;
    if (!target || !("closest" in target) || typeof target.closest !== "function") return;
    if (target.closest(".dps-action, .ep-weights-action")) {
      hideNotice();
      options.onRun();
    }
    const stopButton: Element | null = target.closest(".sim-abort-button");
    if (!stopButton || pendingStop?.button.isConnected) return;
    hostWindow.clearTimeout(pendingStop?.timer);
    const timer = hostWindow.setTimeout(() => {
      pendingStop = undefined;
      if (!stopButton.isConnected || frame.contentDocument !== frameDocument) return;
      const url = simulatorRestartUrl(frameWindow.location.href, hostWindow.location.origin);
      if (url) options.onRestart(url);
      else showNotice("The engine could not restart safely. Save your setup and reload this page.");
    }, simulatorStopGraceMs);
    pendingStop = { button: stopButton, timer };
  };
  frameDocument.addEventListener("click", requestStop, true);

  return () => {
    hostWindow.clearTimeout(pendingStop?.timer);
    frameDocument.removeEventListener("click", requestStop, true);
    if (frame.contentDocument === frameDocument && frameWindow.alert === showNotice)
      frameWindow.alert = originalAlert;
    chooseRace.removeEventListener("click", focusRace);
    loadBuild.removeEventListener("click", applySelectedBuild);
    dismiss.removeEventListener("click", hideNotice);
    frameDocument.removeEventListener("change", hideNotice);
    if (raceControl && racePlaceholder.parentNode) racePlaceholder.replaceWith(raceControl);
    if (race) {
      if (originalDescription === null) race.removeAttribute("aria-describedby");
      else race.setAttribute("aria-describedby", originalDescription);
    }
    racePanel.remove();
    notice.remove();
    style.remove();
  };
}
