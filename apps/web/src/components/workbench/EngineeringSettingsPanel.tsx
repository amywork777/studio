import {
  DEFAULT_CLIENT_SETTINGS,
  DRAFTING_STANDARDS,
  type DraftingStandard,
  usualGeneralTolerance,
  VIEWER_MICE,
  type ViewerMouse,
} from "@t3tools/contracts";

import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "../settings/settingsLayout";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "../settings/useScopedSettings";
import { DraftInput } from "../ui/draft-input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { STANDARD_LABELS } from "./briefFolder";

const MOUSE_LABELS: Record<ViewerMouse, string> = {
  studio: "Studio",
  solidworks: "SolidWorks",
  nx: "NX",
  fusion: "Fusion",
  onshape: "Onshape",
};

// Each CAD's buttons as its own help states them (text-to-cad's `viewerControlsHost` applies them).
// NX's drag zoom is left out until it is checked in NX itself.
const MOUSE_HOW: Record<ViewerMouse, string> = {
  studio: "Orbit with a left drag, pan with a right drag, zoom with the wheel.",
  solidworks:
    "Orbit with a middle drag, pan with Ctrl and a middle drag, zoom with the wheel or Shift and a middle drag.",
  nx: "Orbit with a middle drag, pan with Shift and a middle drag, zoom with the wheel.",
  fusion:
    "Orbit with Shift and a middle drag, pan with a middle drag, zoom with the wheel or Ctrl, Shift and a middle drag.",
  onshape:
    "Orbit with a right drag, pan with a middle drag or Ctrl and a right drag, zoom with the wheel.",
};

const STANDARD_HOW: Record<DraftingStandard, string> = {
  ISO: "ISO GPS, first-angle projection.",
  ASME: "ASME Y14.5, third-angle projection.",
};

/**
 * Settings, Engineering: what an engineer sets once, as their CAD has it. How the mouse moves a CAD
 * view is this device's own (`viewerMouse`, `viewerReverseWheel`, `viewerZoomToPointer`), sent to each
 * view by `PluginViewFrame` as `studio/viewerControls`.
 */
export function EngineeringSettingsPanel() {
  const mouse = useClientSettings((settings) => settings.viewerMouse);
  const reverseWheel = useClientSettings((settings) => settings.viewerReverseWheel);
  const zoomToPointer = useClientSettings((settings) => settings.viewerZoomToPointer);
  return (
    <SettingsPageContainer>
      <SettingsSection id="engineering-mouse" title="Mouse and view">
        <SettingsRow
          id="viewer-mouse"
          devicePreference
          title="Navigate like"
          description={
            mouse === "studio"
              ? MOUSE_HOW.studio
              : `${MOUSE_HOW[mouse]} The left button selects. Needs a mouse with a middle button.`
          }
          resetAction={
            mouse !== DEFAULT_CLIENT_SETTINGS.viewerMouse ? (
              <SettingResetButton
                ariaLabel="Reset Navigate like to Studio"
                onClick={() =>
                  void updateClientSettings({ viewerMouse: DEFAULT_CLIENT_SETTINGS.viewerMouse })
                }
              />
            ) : null
          }
          control={
            <Select
              value={mouse}
              onValueChange={(value) => {
                const next = VIEWER_MICE.find((entry) => entry === value);
                if (next !== undefined) void updateClientSettings({ viewerMouse: next });
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-44" aria-label="Navigate like">
                <SelectValue>{MOUSE_LABELS[mouse]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false} sideOffset={6}>
                {VIEWER_MICE.map((value) => (
                  <SelectItem key={value} hideIndicator value={value}>
                    {MOUSE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          id="viewer-reverse-wheel"
          devicePreference
          title="Reverse wheel zoom"
          description="Roll the wheel toward you to zoom in. A pinch on a trackpad is unchanged."
          control={
            <Switch
              checked={reverseWheel}
              onCheckedChange={(checked) =>
                void updateClientSettings({ viewerReverseWheel: Boolean(checked) })
              }
              aria-label="Reverse wheel zoom"
            />
          }
        />
        <SettingsRow
          id="viewer-zoom-to-pointer"
          devicePreference
          title="Zoom toward the pointer"
          description="Zoom into what is under the pointer. Off, the wheel zooms into the middle of the view."
          control={
            <Switch
              checked={zoomToPointer}
              onCheckedChange={(checked) =>
                void updateClientSettings({ viewerZoomToPointer: Boolean(checked) })
              }
              aria-label="Zoom toward the pointer"
            />
          }
        />
      </SettingsSection>
      <NewProjectSettings />
      <TitleBlockSettings />
    </SettingsPageContainer>
  );
}

/**
 * What a new project's brief starts with. Each project keeps its own after that, changed from its
 * setup, so changing these never changes a project already made.
 */
function NewProjectSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixedTolerance = useScopedSettingsMixed(["newProjectGeneralTolerance"]);
  const units = settings.newProjectUnits;
  const standard = settings.newProjectStandard;
  return (
    <SettingsSection id="engineering-new-projects" title="New projects">
      <SettingsRow
        id="new-project-units"
        serverScoped
        settingKeys={["newProjectUnits"]}
        title="Units"
        description="What a new project is designed and drawn in. Each project can change its own."
        control={
          <ToggleGroup
            aria-label="Units"
            value={[units]}
            onValueChange={(next) => {
              const value = next[0];
              if ((value === "mm" || value === "in") && value !== units)
                updateSettings({ newProjectUnits: value });
            }}
          >
            <Toggle value="mm">mm</Toggle>
            <Toggle value="in">in</Toggle>
          </ToggleGroup>
        }
      />
      <SettingsRow
        id="new-project-standard"
        serverScoped
        settingKeys={["newProjectStandard"]}
        title="Drafting standard"
        description={`${STANDARD_HOW[standard]} Whose rules a new project's drawings are read by.`}
        control={
          <Select
            value={standard}
            onValueChange={(value) => {
              const next = DRAFTING_STANDARDS.find((entry) => entry === value);
              if (next !== undefined) updateSettings({ newProjectStandard: next });
            }}
          >
            <SelectTrigger size="sm" className="w-full sm:w-44" aria-label="Drafting standard">
              <SelectValue>{STANDARD_LABELS[standard]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false} sideOffset={6}>
              {DRAFTING_STANDARDS.map((value) => (
                <SelectItem key={value} hideIndicator value={value}>
                  {STANDARD_LABELS[value]}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        id="new-project-general-tolerance"
        serverScoped
        settingKeys={["newProjectGeneralTolerance"]}
        title="General tolerance"
        description="What every size without its own tolerance is held to. Leave empty for the standard's usual."
        control={
          <DraftInput
            size="sm"
            className="w-full sm:w-44"
            value={mixedTolerance ? "" : settings.newProjectGeneralTolerance}
            onCommit={(next) => updateSettings({ newProjectGeneralTolerance: next })}
            placeholder={mixedTolerance ? "Mixed" : usualGeneralTolerance(standard, units)}
            spellCheck={false}
            aria-label="General tolerance"
          />
        }
      />
    </SettingsSection>
  );
}

/** The person's name on every drawing, in every project: read by the agent each turn. */
function TitleBlockSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixedCompany = useScopedSettingsMixed(["titleBlockCompany"]);
  const mixedDrawnBy = useScopedSettingsMixed(["titleBlockDrawnBy"]);
  return (
    <SettingsSection id="engineering-title-block" title="Title block">
      <SettingsRow
        id="title-block-company"
        serverScoped
        settingKeys={["titleBlockCompany"]}
        title="Company"
        description="Printed in every drawing's title block."
        control={
          <DraftInput
            size="sm"
            className="w-full sm:w-56"
            value={mixedCompany ? "" : settings.titleBlockCompany}
            onCommit={(next) => updateSettings({ titleBlockCompany: next })}
            placeholder={mixedCompany ? "Mixed" : "None"}
            aria-label="Company"
          />
        }
      />
      <SettingsRow
        id="title-block-drawn-by"
        serverScoped
        settingKeys={["titleBlockDrawnBy"]}
        title="Drawn by"
        description="The name in every drawing's DRAWN cell."
        control={
          <DraftInput
            size="sm"
            className="w-full sm:w-56"
            value={mixedDrawnBy ? "" : settings.titleBlockDrawnBy}
            onCommit={(next) => updateSettings({ titleBlockDrawnBy: next })}
            placeholder={mixedDrawnBy ? "Mixed" : "None"}
            aria-label="Drawn by"
          />
        }
      />
    </SettingsSection>
  );
}
