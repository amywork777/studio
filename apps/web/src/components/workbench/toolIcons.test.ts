import { describe, expect, it } from "vite-plus/test";

import { ACTION_SECTIONS, HARDWARE_ACTIONS, type HardwareAction } from "./hardwareActions";
import { MENU_ICONS, templateIcon } from "./kinds";
import { NEW_TEMPLATES } from "./newTemplates";
import { hasSectionIcon, JOB_ICON_IDS, toolIcon } from "./toolIcons";

/**
 * Jobs in one section that may share a picture, as `[section, first job, second job]`, each with
 * why. Empty: every section's tiles read as different tools today.
 */
const SHARED_IN_SECTION: ReadonlyArray<readonly [string, string, string]> = [];

const shareAllowed = (section: string, a: string, b: string) =>
  SHARED_IN_SECTION.some(
    ([where, first, second]) =>
      where === section && ((first === a && second === b) || (first === b && second === a)),
  );

const job = (overrides: Partial<HardwareAction>): HardwareAction => ({
  ...HARDWARE_ACTIONS[0]!,
  ...overrides,
});

describe("toolIcon", () => {
  it("gives every job a picture of its own, not just its group's", () => {
    const generic = HARDWARE_ACTIONS.filter(
      (action) => toolIcon(action) === MENU_ICONS[action.group],
    );
    expect(generic.map((action) => action.id)).toEqual([]);
  });

  it("keys every picture of its own to a real job", () => {
    const ids = new Set(HARDWARE_ACTIONS.map((action) => action.id));
    expect(JOB_ICON_IDS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("gives a New template that is a job the job's picture", () => {
    const jobOf = {
      "sheet-metal": "sheet-metal",
      "cam-job": "cnc",
      print: "fdm",
      "cut-file": "dxf",
    };
    for (const [templateId, jobId] of Object.entries(jobOf)) {
      const template = NEW_TEMPLATES.find((each) => each.id === templateId)!;
      const action = HARDWARE_ACTIONS.find((each) => each.id === jobId)!;
      expect(templateIcon(template)).toBe(toolIcon(action));
    }
  });

  it("tells the tools in a section apart, and the tools on one tab", () => {
    const clashes: string[] = [];
    for (const section of ACTION_SECTIONS) {
      const jobs = HARDWARE_ACTIONS.filter((action) => action.section === section.id);
      jobs.forEach((a, index) => {
        for (const b of jobs.slice(index + 1)) {
          if (toolIcon(a) === toolIcon(b) && !shareAllowed(section.id, a.id, b.id)) {
            clashes.push(`${section.id}: ${a.id} and ${b.id}`);
          }
        }
      });
    }
    expect(clashes).toEqual([]);
    // The Toolbox shows one group's tab at a time: no two of its tiles share a picture.
    for (const group of new Set(HARDWARE_ACTIONS.map((action) => action.group))) {
      const icons = HARDWARE_ACTIONS.filter((action) => action.group === group).map(toolIcon);
      expect(new Set(icons).size, group).toBe(icons.length);
    }
  });

  it("falls back to the section's picture, then the group's, for a job without one", () => {
    expect(ACTION_SECTIONS.filter((section) => !hasSectionIcon(section.id))).toEqual([]);
    const simulation = job({ id: "new-simulation-job", group: "Evaluate", section: "simulation" });
    const strength = HARDWARE_ACTIONS.find((action) => action.id === "strength")!;
    expect(toolIcon(simulation)).toBe(toolIcon(strength));
    const loose = job({ id: "new-job", group: "Document", section: "new-section" });
    expect(toolIcon(loose)).toBe(MENU_ICONS.Document);
  });
});
