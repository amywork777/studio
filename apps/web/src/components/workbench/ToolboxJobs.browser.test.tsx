import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { HARDWARE_ACTIONS, type HardwareAction } from "./hardwareActions";
import type { ToolboxSection } from "./toolbox";
import { NEW_TEMPLATES, type NewTemplate } from "./newTemplates";
import { SectionJobs } from "./ToolboxJobs";

const jobs = HARDWARE_ACTIONS.filter((action) => action.section === "simulation");
const section: ToolboxSection = { title: "Simulation", actions: jobs };

function renderSection(
  disabled: boolean,
  onRun: (action: HardwareAction) => void,
  worksOn: (action: HardwareAction) => string | null = () => null,
  shown: ToolboxSection = section,
  starts: {
    readonly startFor: (action: HardwareAction) => NewTemplate | null;
    readonly onStart: (template: NewTemplate) => void;
  } = { startFor: () => null, onStart: () => {} },
) {
  return render(
    <SectionJobs
      section={shown}
      disabled={disabled}
      worksOn={worksOn}
      startFor={starts.startFor}
      onRun={onRun}
      onStart={starts.onStart}
    />,
  );
}

describe("SectionJobs tool tiles", () => {
  it("names each tile by its job and describes it by what the job makes", async () => {
    await using screen = await renderSection(false, () => {});
    for (const job of jobs) {
      await expect
        .element(screen.getByRole("button", { name: job.label, exact: true }))
        .toHaveAccessibleDescription(job.gets);
    }
  });

  it("runs the pressed tile's job", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await using screen = await renderSection(false, onRun);
    const strength = jobs.find((job) => job.id === "strength")!;

    await screen.getByRole("button", { name: strength.label, exact: true }).click();

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0]?.[0].prompt("part.step")).toBe(strength.prompt("part.step"));
  });

  it("runs nothing with no chat to write the job into", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await using screen = await renderSection(true, onRun);

    await screen.getByRole("button", { name: jobs[0]!.label, exact: true }).click({ force: true });

    expect(onRun).not.toHaveBeenCalled();
  });

  it("keeps a job that does not fit the file in front, says what it works on, and runs nothing", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    const fitAndMass = HARDWARE_ACTIONS.filter((action) => action.section === "fit-mass");
    const fit = fitAndMass.find((job) => job.id === "fit")!;
    const mass = fitAndMass.find((job) => job.id === "mass")!;
    const line = "Works on an assembly. Open one to use it.";
    await using screen = await renderSection(
      false,
      onRun,
      (action) => (action.id === "fit" ? line : null),
      { title: "Fit and mass", actions: fitAndMass },
    );
    const fitTile = screen.getByRole("button", { name: fit.label, exact: true });

    await expect.element(fitTile).toHaveAccessibleDescription(line);
    await expect.element(fitTile).toHaveAttribute("aria-disabled", "true");
    await fitTile.click({ force: true });
    expect(onRun).not.toHaveBeenCalled();

    // The ones that fit still run.
    await screen.getByRole("button", { name: mass.label, exact: true }).click();
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("opens New on what a job works on where the project has none, and runs nothing", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    const onStart = vi.fn<(template: NewTemplate) => void>();
    const fitAndMass = HARDWARE_ACTIONS.filter((action) => action.section === "fit-mass");
    const fit = fitAndMass.find((job) => job.id === "fit")!;
    const assembly = NEW_TEMPLATES.find((template) => template.id === "assembly")!;
    await using screen = await renderSection(
      false,
      onRun,
      (action) => (action.id === "fit" ? "Works on an assembly." : null),
      { title: "Fit and mass", actions: fitAndMass },
      { startFor: (action) => (action.id === "fit" ? assembly : null), onStart },
    );
    const fitTile = screen.getByRole("button", { name: fit.label, exact: true });

    await expect.element(fitTile).not.toHaveAttribute("aria-disabled");
    await fitTile.click();
    expect(onStart).toHaveBeenCalledWith(assembly);
    expect(onRun).not.toHaveBeenCalled();
  });
});
