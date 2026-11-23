/**
 * The panel's views kept mounted while another tab is in front, so switching back is instant: a CAD
 * view keeps its model and camera instead of loading again. The most recently shown first, at most
 * `cap` of them (each holds a WebGL context), and only views still open.
 */
const KEPT_VIEWS = 3;

export function keptSurfaces<Surface extends { readonly id: string }>(
  kept: ReadonlyArray<Surface>,
  shown: Surface | null,
  open: ReadonlyArray<{ readonly id: string }>,
  cap: number = KEPT_VIEWS,
): ReadonlyArray<Surface> {
  const openIds = new Set(open.map((surface) => surface.id));
  const others = kept.filter((surface) => surface.id !== shown?.id && openIds.has(surface.id));
  const next = (shown === null ? others : [shown, ...others]).slice(0, cap);
  return next.length === kept.length && next.every((surface, index) => surface === kept[index])
    ? kept
    : next;
}
