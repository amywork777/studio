// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { HARDWARE_ACTIONS, type HardwareAction } from "./hardwareActions";
import type { ToolboxSection } from "./toolbox";
import { NEW_TEMPLATES, type NewTemplate } from "./newTemplates";
import { SectionJobs } from "./ToolboxJobs";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const jobs = HARDWARE_ACTIONS.filter((action) => action.section === "simulation");
const section: ToolboxSection = { title: "Simulation", actions: jobs };

/** A button's accessible name from its content: what is hidden from readers is left out. */
function nameOf(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (!(node instanceof HTMLElement)) return "";
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return "";
      return nameOf(node);
    })
    .join("")
    .trim();
}

/** The button a reader finds by that name. */
function tile(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (button) => nameOf(button) === name,
  );
  if (!found) throw new Error(`No button named ${name}`);
  return found;
}

/** What a reader hears after the name: the text of the elements `aria-describedby` points to. */
function descriptionOf(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

async function renderSection(
  disabled: boolean,
  onRun: (action: HardwareAction) => void,
  worksOn: (action: HardwareAction) => string | null = () => null,
  shown: ToolboxSection = section,
  starts: {
    readonly startFor: (action: HardwareAction) => NewTemplate | null;
    readonly onStart: (template: NewTemplate) => void;
  } = { startFor: () => null, onStart: () => {} },
) {
  await act(async () => {
    root.render(
      <SectionJobs
        section={shown}
        disabled={disabled}
        worksOn={worksOn}
        startFor={starts.startFor}
        onRun={onRun}
        onStart={starts.onStart}
      />,
    );
  });
}

describe("SectionJobs tool tiles", () => {
  it("names each tile by its job and describes it by what the job makes", async () => {
    await renderSection(false, () => {});
    for (const job of jobs) {
      expect(descriptionOf(tile(job.label))).toBe(job.gets);
    }
  });

  it("runs the pressed tile's job", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await renderSection(false, onRun);
    const strength = jobs.find((job) => job.id === "strength")!;

    await act(async () => tile(strength.label).click());

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0]?.[0].prompt("part.step")).toBe(strength.prompt("part.step"));
  });

  it("runs nothing with no chat to write the job into", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await renderSection(true, onRun);

    await act(async () => tile(jobs[0]!.label).click());

    expect(onRun).not.toHaveBeenCalled();
  });

  it("keeps a job that does not fit the file in front, says what it works on, and runs nothing", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    const fitAndMass = HARDWARE_ACTIONS.filter((action) => action.section === "fit-mass");
    const fit = fitAndMass.find((job) => job.id === "fit")!;
    const mass = fitAndMass.find((job) => job.id === "mass")!;
    const line = "Works on an assembly. Open one to use it.";
    await renderSection(false, onRun, (action) => (action.id === "fit" ? line : null), {
      title: "Fit and mass",
      actions: fitAndMass,
    });

    expect(descriptionOf(tile(fit.label))).toBe(line);
    expect(tile(fit.label).getAttribute("aria-disabled")).toBe("true");
    await act(async () => tile(fit.label).click());
    expect(onRun).not.toHaveBeenCalled();

    // The ones that fit still run.
    await act(async () => tile(mass.label).click());
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("opens New on what a job works on where the project has none, and runs nothing", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    const onStart = vi.fn<(template: NewTemplate) => void>();
    const fitAndMass = HARDWARE_ACTIONS.filter((action) => action.section === "fit-mass");
    const fit = fitAndMass.find((job) => job.id === "fit")!;
    const assembly = NEW_TEMPLATES.find((template) => template.id === "assembly")!;
    await renderSection(
      false,
      onRun,
      (action) => (action.id === "fit" ? "Works on an assembly." : null),
      { title: "Fit and mass", actions: fitAndMass },
      { startFor: (action) => (action.id === "fit" ? assembly : null), onStart },
    );

    expect(tile(fit.label).getAttribute("aria-disabled")).toBeNull();
    await act(async () => tile(fit.label).click());
    expect(onStart).toHaveBeenCalledWith(assembly);
    expect(onRun).not.toHaveBeenCalled();
  });
});
