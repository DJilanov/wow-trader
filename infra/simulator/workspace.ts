import type { SimUI } from "./sim_ui.js";
import tankStarters from "./kfc_tank_starters.json";
import prebisImport from "./kfc_prebis_import.json";
import { disposeInspection } from "./kfc_inspection.js";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Simulator workspace element missing: ${selector}`);
  return node;
}

export function installKfcSimulationMeasurement(sim: SimUI["sim"]): () => void {
  const listener = sim.simResultEmitter.on((): void => {
    try {
      if (window.parent !== window)
        window.parent.postMessage(
          { type: "kfc-simulation-completed", version: 1 },
          window.location.origin,
        );
    } catch {
      // Optional host measurement must not interfere with result delivery.
    }
  });
  return () => listener.dispose();
}

// Move existing nodes, never clone controls or alter simulation state.
export function installKfcWorkspace(ui: SimUI): () => void {
  if (ui.isWithinRaidSim) return () => {};
  const root = ui.rootElem;
  const dismissItemPicker = (event: MessageEvent<unknown>): void => {
    if (
      event.origin !== window.location.origin ||
      event.source !== window.parent ||
      !event.data ||
      typeof event.data !== "object" ||
      !("type" in event.data) ||
      event.data.type !== "kfc-simulator-dismiss-item-picker"
    )
      return;
    root
      .querySelector<HTMLButtonElement>(".modal.show > .selector-modal .modal-header .btn-close")
      ?.click();
  };
  window.addEventListener("message", dismissItemPicker);
  const disposeMeasurement = installKfcSimulationMeasurement(ui.sim);
  root.classList.add("kfc-workspace");
  root.dataset.mobileView = "build";
  const simRoot = required(root, ".sim-root");
  const container = required(root, ".sim-container");
  const sidebar = required(root, ".sim-sidebar");
  const content = required(root, ".sim-content");
  const header = element("header", "kfc-workspace-heading");
  const identity = required(root, ".sim-title");
  header.append(identity);
  const utilities = element("div", "kfc-workspace-utilities");
  const model = element("span", "kfc-model-badge");
  const ruleset = required(root, ".ruleset-label");
  const updateRuleset = (): void => {
    model.textContent = ruleset.textContent + " · Beta model";
  };
  updateRuleset();
  const rulesetListener = ui.sim.rulesetChangeEmitter.on(updateRuleset);
  const imports = required(root, ".import-export");
  for (const toggle of imports.querySelectorAll<HTMLElement>('[data-bs-toggle="dropdown"]')) {
    toggle.dataset.bsTrigger = "click";
  }
  const options = required<HTMLAnchorElement>(root, ".sim-options");
  options.textContent = "Options";
  options.setAttribute("aria-label", "Simulation options");
  utilities.append(model, imports, options);
  required(root, ".sim-toolbar").remove();
  ui.simHeader.rootElem.append(utilities);
  header.append(ui.simHeader.rootElem);
  simRoot.prepend(header);
  const resizeObserver = new ResizeObserver(() => {
    root.style.setProperty(
      "--kfc-header-height",
      `${Math.ceil(header.getBoundingClientRect().height)}px`,
    );
  });
  resizeObserver.observe(header);
  container.append(sidebar);
  sidebar.setAttribute("aria-label", "Simulation and results");
  sidebar.id = "kfc-simulation-panel";
  content.id = "kfc-build-panel";

  const runHeading = element("div", "kfc-run-heading");
  runHeading.append(
    element("span", "kfc-eyebrow", "Test your build"),
    element("h2", "", "Simulation"),
  );
  const status = element("span", "kfc-run-status", "Ready");
  status.setAttribute("role", "status");
  runHeading.append(status);
  sidebar.prepend(runHeading);

  const stats = required(root, ".sim-sidebar-stats");
  const statsDetails = element("details", "kfc-character-stats");
  statsDetails.append(element("summary", "", "Character stats"));
  stats.before(statsDetails);
  statsDetails.append(stats);
  const footer = required(root, ".sim-sidebar-footer");
  footer.prepend(
    element("p", "kfc-device-note", "Computed on your device. Your build stays in this browser."),
  );
  required(root, ".sim-sidebar-socials").remove();

  const empty = element("div", "kfc-result-empty");
  empty.append(
    element("span", "kfc-result-symbol", "↗"),
    element("h3", "", "Find your next upgrade"),
    element(
      "p",
      "",
      "Choose your gear and talents, then simulate. Compare changes against a saved result.",
    ),
  );
  ui.resultsViewer.rootElem.prepend(empty);
  const stopNote = element("div", "kfc-stop-note");
  stopNote.hidden = true;
  stopNote.setAttribute("role", "status");
  stopNote.append(
    element(
      "p",
      "",
      "This engine may need to finish its current batch before stopping. Restart it to end the run immediately; current results will be cleared.",
    ),
  );
  const restart = element("button", "btn", "Restart engine · clears results");
  restart.type = "button";
  const restartEngine = (): void => window.location.reload();
  restart.addEventListener("click", restartEngine);
  stopNote.append(restart);
  ui.resultsViewer.rootElem.append(stopNote);
  let stopRequested = false;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const updateResultState = (): void => {
    const running =
      ui.resultsViewer.pendingElem.style.display !== "none" ||
      ui.resultsViewer.buttonElem.childElementCount > 0;
    const hasContent =
      ui.resultsViewer.contentElem.style.display !== "none" &&
      !!ui.resultsViewer.contentElem.textContent?.trim();
    empty.hidden = running || hasContent;
    root.dataset.simulationState = running ? "running" : hasContent ? "complete" : "ready";
    if (!running) {
      stopRequested = false;
      stopNote.hidden = true;
      clearTimeout(stopTimer);
    }
    status.textContent = running
      ? stopRequested
        ? "Stopping…"
        : "Running…"
      : hasContent
        ? "Run complete"
        : "Ready";
    ui.resultsViewer.rootElem.setAttribute("aria-busy", String(running));
  };
  const requestStop = (event: MouseEvent): void => {
    if (!(event.target instanceof Element) || !event.target.closest(".sim-abort-button")) return;
    stopRequested = true;
    updateResultState();
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      if (stopRequested) stopNote.hidden = false;
    }, 5000);
  };
  ui.resultsViewer.buttonElem.addEventListener("click", requestStop);
  const resultsObserver = new MutationObserver(updateResultState);
  resultsObserver.observe(ui.resultsViewer.rootElem, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style"],
  });
  updateResultState();

  const mobileNav = element("nav", "kfc-mobile-nav");
  mobileNav.setAttribute("aria-label", "Simulator workspace");
  const buildButton = element("button", "", "Build");
  const resultsButton = element("button", "", "Results");
  for (const button of [buildButton, resultsButton]) button.type = "button";
  buildButton.setAttribute("aria-controls", content.id);
  resultsButton.setAttribute("aria-controls", sidebar.id);
  const setView = (view: "build" | "results"): void => {
    root.dataset.mobileView = view;
    buildButton.setAttribute("aria-pressed", String(view === "build"));
    resultsButton.setAttribute("aria-pressed", String(view === "results"));
  };
  const showBuild = (): void => setView("build");
  const showResults = (): void => setView("results");
  buildButton.addEventListener("click", showBuild);
  resultsButton.addEventListener("click", showResults);
  setView("build");
  mobileNav.append(buildButton, resultsButton);
  simRoot.append(mobileNav);

  const tabs = required(root, ".sim-tabs");
  tabs.setAttribute("aria-label", "Build settings");
  const updateTabs = (): void => {
    for (const tab of tabs.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const selected = tab.classList.contains("active");
      const tabIndex = selected ? "0" : "-1";
      if (tab.getAttribute("tabindex") !== tabIndex) tab.setAttribute("tabindex", tabIndex);
    }
  };
  const tabsObserver = new MutationObserver(updateTabs);
  tabsObserver.observe(tabs, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "tabindex"],
  });
  const onTabKey = (event: KeyboardEvent): void => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('[role="tab"]')) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      event.target.click();
      updateTabs();
      event.target.focus();
      return;
    }
    const list = Array.from(tabs.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
      (tab) => tab.getClientRects().length,
    );
    const index = list.indexOf(event.target);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const target =
      event.key === "Home"
        ? list[0]
        : event.key === "End"
          ? list[list.length - 1]
          : list[(index + (event.key === "ArrowRight" ? 1 : -1) + list.length) % list.length];
    target.click();
    updateTabs();
    target.focus();
  };
  tabs.addEventListener("keydown", onTabKey, true);
  // Subclasses build their tabs synchronously after the shared constructor finishes.
  let disposed = false;
  queueMicrotask(() => {
    if (disposed) return;
    updateTabs();
    const gear = root.querySelector<HTMLElement>(".gear-tab-left");
    if (gear) {
      const heading = element("div", "kfc-section-heading");
      heading.append(
        element("span", "kfc-eyebrow", "Your loadout"),
        element("h2", "", "Equipment"),
        element("p", "", "Select a slot to compare items and enchants."),
      );
      gear.prepend(heading);
    }
    const library = root.querySelector<HTMLElement>(".gear-tab-right");
    if (library) {
      library.prepend(element("h2", "kfc-library-title", "Build library"));
      const enchantNote = element(
        "p",
        "kfc-starter-info",
        "Your first visit starts with a suggested loadout and reviewed enchants. Saved builds stay unchanged. ",
      );
      library.querySelector(".kfc-library-title")?.after(enchantNote);
      gear?.before(library);
      const catalogNote = element("p", "kfc-starter-info");
      catalogNote.append(
        document.createTextNode(
          `Pre-raid catalog: ${prebisImport.items.length} provisional Classic references across all equipment slots. Raid acquisition is excluded from this import. Historical stats, procs and set effects need Forever verification. These are candidates, not final BiS rankings.`,
        ),
      );
      if (prebisImport.currentItems?.length)
        catalogNote.append(
          document.createTextNode(
            ` ${prebisImport.currentItems.length} additional items use current-client stats with explicitly provisional historical acquisition. Set/utility model limitations are shown in their tooltips.`,
          ),
        );
      library.querySelector(".kfc-library-title")?.after(catalogNote);
      const starter = Object.values(tankStarters).find((entry) =>
        root.classList.contains(entry.cssClass),
      );
      if (starter) {
        const info = element("div", "kfc-starter-info");
        info.append(
          element(
            "p",
            "",
            "Level 60 · Blue PvP core + stat-weighted fillers. Load the starter from Gear Sets below; it replaces gear, not your talents or rotation.",
          ),
        );
        const details = element("details", "kfc-starter-method");
        details.append(element("summary", "", "Starter priorities & assumptions"));
        details.append(element("p", "", starter.priorities));
        details.append(
          element(
            "p",
            "",
            `Equipment before enchants: ${starter.totals[2]} stamina · ${starter.totals[26]} armor + ${starter.totals[40]} bonus armor · ${starter.totals[28]} defense · ${starter.totals[18]}% melee hit · ${starter.totals[5] + starter.totals[42]} spell power/damage. These are starter totals, not your current edited build.`,
          ),
        );
        const bonus = starter.enchantTotals;
        details.append(
          element(
            "p",
            "",
            `${starter.enchantCount} default enchants additionally provide: ${bonus[0]} strength · ${bonus[1]} agility · ${bonus[2]} stamina · ${bonus[28]} defense · ${bonus[40]} bonus armor · ${bonus[5] + bonus[42]} spell power/damage. Character buffs, talents and form multipliers are not included.`,
          ),
        );
        details.append(element("p", "", starter.caveat));
        info.append(details);
        library.querySelector(".kfc-library-title")?.after(info);
      }
    }
  });
  return (): void => {
    disposeInspection();
    window.removeEventListener("message", dismissItemPicker);
    disposed = true;
    rulesetListener.dispose();
    disposeMeasurement();
    resultsObserver.disconnect();
    clearTimeout(stopTimer);
    ui.resultsViewer.buttonElem.removeEventListener("click", requestStop);
    restart.removeEventListener("click", restartEngine);
    resizeObserver.disconnect();
    tabsObserver.disconnect();
    tabs.removeEventListener("keydown", onTabKey, true);
    buildButton.removeEventListener("click", showBuild);
    resultsButton.removeEventListener("click", showResults);
  };
}
