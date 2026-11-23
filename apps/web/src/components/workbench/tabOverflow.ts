/**
 * Which tabs of a scrolled tab strip are out of sight, or only partly in it, for its "N more"
 * menu: each tab's left and right edge against the strip's visible span, a pixel of slack.
 */
export function hiddenTabs<Id>(
  tabs: ReadonlyArray<{ readonly id: Id; readonly left: number; readonly right: number }>,
  view: { readonly left: number; readonly right: number },
): Id[] {
  return tabs
    .filter((tab) => tab.left < view.left - 1 || tab.right > view.right + 1)
    .map((tab) => tab.id);
}

/** A tab's file draws a picture on hover where the CAD tools render its kind. */
export const PREVIEWABLE = /\.(?:step|stp|stl|3mf|glb|xbf)$/i;
