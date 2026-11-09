import { useLayoutEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";

/** Where a card's dots sit below its top, by `out:<socket>` and `in:<input>`. */
export type Dots = Readonly<Record<string, number>>;

/**
 * Measures a node card for the canvas: its height as it changes, so a column's cards stack without
 * overlapping, and where each of its dots (`[data-socket]`) sits after every layout, so the wires
 * meet them. The card is drawn scaled, so the offsets are divided by the scale it shows at.
 */
export function useCardMeasure(onHeight: (height: number) => void, onDots: (dots: Dots) => void) {
  const card = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = card.current;
    if (element === null) return;
    return observeResize(element, () => onHeight(element.offsetHeight));
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Observed once; the callback reads the latest node.
  }, []);
  useLayoutEffect(() => {
    const element = card.current;
    if (element === null) return;
    const box = element.getBoundingClientRect();
    const scale = element.offsetHeight > 0 ? box.height / element.offsetHeight : 1;
    const found: Record<string, number> = {};
    for (const dot of element.querySelectorAll<HTMLElement>("[data-socket]")) {
      const at = dot.getBoundingClientRect();
      found[dot.dataset.socket ?? ""] = (at.top + at.height / 2 - box.top) / scale;
    }
    onDots(found);
  });
  return card;
}
