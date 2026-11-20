import * as Schema from "effect/Schema";

/**
 * Studio: the CAD whose mouse a CAD view copies (Settings, Engineering). Sent to the view in its host
 * context as `studio/viewerControls`, where text-to-cad's `viewerControlsHost` maps each to buttons.
 */
export const VIEWER_MICE = ["studio", "solidworks", "nx", "fusion", "onshape"] as const;
export const ViewerMouse = Schema.Literals(VIEWER_MICE);
export type ViewerMouse = typeof ViewerMouse.Type;
