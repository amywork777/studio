import { DEFAULT_CLIENT_SETTINGS, VIEWER_MICE, type ViewerMouse } from "@t3tools/contracts";

import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "../settings/settingsLayout";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";

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
              <SelectPopup align="end" alignItemWithTrigger={false}>
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
    </SettingsPageContainer>
  );
}
