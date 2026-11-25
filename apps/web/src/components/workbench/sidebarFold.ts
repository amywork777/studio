const listeners = new Set<(open: boolean) => void>();

/**
 * A project just opened, or a part in CAD: it starts with the sidebar folded, for the model to have
 * its column, and the header's switcher moves between projects. Opening runs outside React
 * (`openPartInCad`), so this asks whoever holds the sidebar (`AppSidebarLayout`). The panel button
 * and the shortcut bring it back as ever.
 */
export function foldSidebarForPart() {
  for (const listener of listeners) listener(false);
}

/** Opens the sidebar for what points into it: the tour's step on the project's row. */
export function showSidebar() {
  for (const listener of listeners) listener(true);
}

/** Hears `foldSidebarForPart` and `showSidebar`, the sidebar's open state asked for. Returns the way to stop. */
export function onSidebarAsked(listener: (open: boolean) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
