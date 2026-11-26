import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { HARDWARE_ACTIONS, type HardwareAction } from "./hardwareActions";
import type { ToolboxSection } from "./toolbox";
import { NEW_TEMPLATES, type NewTemplate } from "./newTemplates";
import { SectionJobs } from "./ToolboxJobs";
import { ToolboxPopup } from "./ToolboxPopup";

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

describe("SectionJobs tool rows", () => {
  it("says what each job makes on its row, and opens how it works from its name", async () => {
    await using screen = await renderSection(false, () => {});
    for (const job of jobs) {
      await expect
        .element(screen.getByRole("button", { name: job.label, exact: true }))
        .toHaveAccessibleDescription(job.gets);
    }
    const strength = jobs.find((job) => job.id === "strength")!;
    const name = screen.getByRole("button", { name: strength.label, exact: true });
    await name.click();
    await expect.element(name).toHaveAttribute("aria-expanded", "true");
    await expect.element(screen.getByText("Works on")).toBeVisible();
    await expect.element(screen.getByText("You give")).toBeVisible();
  });

  it("runs the job from its Run, not from its name", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await using screen = await renderSection(false, onRun);
    const strength = jobs.find((job) => job.id === "strength")!;

    await screen.getByRole("button", { name: strength.label, exact: true }).click();
    expect(onRun).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: `Run ${strength.label}`, exact: true }).click();

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0]?.[0].prompt("part.step")).toBe(strength.prompt("part.step"));
  });

  it("runs nothing with no chat to write the job into", async () => {
    const onRun = vi.fn<(action: HardwareAction) => void>();
    await using screen = await renderSection(true, onRun);
    const run = screen.getByRole("button", { name: `Run ${jobs[0]!.label}`, exact: true });

    await expect.element(run).toBeDisabled();
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

    await expect
      .element(screen.getByRole("button", { name: fit.label, exact: true }))
      .toHaveAccessibleDescription(line);
    await expect
      .element(screen.getByRole("button", { name: `Run ${fit.label}`, exact: true }))
      .toBeDisabled();

    // The ones that fit still run.
    await screen.getByRole("button", { name: `Run ${mass.label}`, exact: true }).click();
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

    await screen.getByRole("button", { name: `Start ${fit.label}`, exact: true }).click();
    expect(onStart).toHaveBeenCalledWith(assembly);
    expect(onRun).not.toHaveBeenCalled();
  });
});

describe("ToolboxPopup", () => {
  async function renderPopup(onOpenChange: (open: boolean) => void) {
    return render(
      <>
        {/* Laid out as the window is: the button top right, the popup under it, clear of the rest. */}
        <button
          type="button"
          data-right-panel-toggle
          style={{ position: "fixed", top: 0, right: 0 }}
        >
          Toolbox
        </button>
        <div data-right-panel-surface-content style={{ position: "fixed", bottom: 0, left: 96 }}>
          <button type="button">Bracket</button>
        </div>
        <button type="button" style={{ position: "fixed", bottom: 0, left: 0 }}>
          Chat
        </button>
        <ToolboxPopup open onOpenChange={onOpenChange}>
          <button type="button">Strength under load</button>
        </ToolboxPopup>
      </>,
    );
  }

  it("stays open for a press on the model, so its tiles follow the part picked there", async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    await using screen = await renderPopup(onOpenChange);
    await expect.element(screen.getByRole("dialog", { name: "Toolbox" })).toBeVisible();

    await screen.getByRole("button", { name: "Bracket" }).click();
    await screen.getByRole("button", { name: "Toolbox", exact: true }).click();

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shuts for a press elsewhere and for Escape", async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    await using screen = await renderPopup(onOpenChange);

    await screen.getByRole("button", { name: "Chat" }).click();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    onOpenChange.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
