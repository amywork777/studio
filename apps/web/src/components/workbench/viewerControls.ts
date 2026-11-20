import type { ViewerMouse } from "@t3tools/contracts";

import { useClientSettings } from "../../hooks/useSettings";

/** How the mouse moves a CAD view, as `PluginViewFrame` sends it (`studio/viewerControls`). */
export interface ViewerControlsContext {
  readonly mouse: ViewerMouse;
  readonly reverseWheel: boolean;
  readonly zoomToPointer: boolean;
}

/** This device's Settings, Engineering, as one value that changes only when a setting does. */
export function useViewerControls(): ViewerControlsContext {
  const mouse = useClientSettings((settings) => settings.viewerMouse);
  const reverseWheel = useClientSettings((settings) => settings.viewerReverseWheel);
  const zoomToPointer = useClientSettings((settings) => settings.viewerZoomToPointer);
  return { mouse, reverseWheel, zoomToPointer };
}
