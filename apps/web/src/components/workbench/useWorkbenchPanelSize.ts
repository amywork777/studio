import * as Schema from "effect/Schema";
import { useLayoutEffect, useRef, useState } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import {
  type PreviewPanelInlineSize,
  usePreviewPanelInlineSize,
} from "~/hooks/usePreviewPanelInlineSize";
import { RESIZABLE_WIDTH_PROPERTY } from "~/hooks/useResizableWidth";
import { useResizeDrag } from "~/hooks/useResizeDrag";
import { observeResize } from "~/lib/observeResize";
import {
  CHAT_DOCK_DEFAULT_WIDTH,
  CHAT_DOCK_WIDTH_STORAGE_KEY,
  chatDockWidth,
  WORKBENCH_LAYOUT,
  workbenchPanelWidth,
} from "./workbenchLayout";

const WidthSchema = Schema.Finite;
/** How long the row must hold still before its width re-renders the chat view. */
const SETTLE_MS = 120;

const readDock = () => {
  try {
    return getLocalStorageItem(CHAT_DOCK_WIDTH_STORAGE_KEY, WidthSchema) ?? CHAT_DOCK_DEFAULT_WIDTH;
  } catch {
    return CHAT_DOCK_DEFAULT_WIDTH;
  }
};

const panelHost = (row: HTMLElement) =>
  row.querySelector<HTMLElement>(':scope > [data-preview-panel-mode="inline"]');

/**
 * The panel takes what the row leaves after the chat dock, one dock width for every thread. While
 * the row resizes, the panel's width is written on it directly each frame, unanimated, and the
 * owner re-renders once the row settles, the way a drag already avoids re-rendering it.
 */
function useWorkbenchPanelSize(
  options: {
    /** The row the chat column and the panel share. */
    readonly container?: HTMLElement | null | undefined;
  } = {},
): PreviewPanelInlineSize {
  const container = options.container ?? null;
  const [dock, setDock] = useState(readDock);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const latestDock = useRef(dock);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the resize observer's dock width current without resubscribing it
  useLayoutEffect(() => {
    latestDock.current = dock;
  }, [dock]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observes the row's DOM width and writes the panel's width on it each frame
  useLayoutEffect(() => {
    if (container === null) return;
    // Before first paint, so the panel never flashes at T3's width.
    // oxlint-disable-next-line react/set-state-in-effect -- The row's width is only known once it mounts.
    setRowWidth(container.clientWidth);
    let settle: ReturnType<typeof setTimeout> | undefined;
    let host: HTMLElement | null = null;
    const release = () => host?.style.removeProperty("transition-property");
    const stop = observeResize(container, () => {
      const row = container.clientWidth;
      host = panelHost(container);
      // A collapsible panel animates its width; following the window must not.
      host?.style.setProperty("transition-property", "none");
      host?.style.setProperty(
        RESIZABLE_WIDTH_PROPERTY,
        `${workbenchPanelWidth(row, latestDock.current)}px`,
      );
      clearTimeout(settle);
      settle = setTimeout(() => {
        setRowWidth(row);
        release();
      }, SETTLE_MS);
    });
    return () => {
      clearTimeout(settle);
      release();
      stop();
    };
  }, [container]);

  // Before the row is measured (the first render), the window stands in for it.
  const width = workbenchPanelWidth(
    rowWidth ?? (typeof window === "undefined" ? 1280 : window.innerWidth),
    dock,
  );
  const { refresh: _refresh, ...handlers } = useResizeDrag<HTMLElement>((event) => {
    if (container === null) return null;
    const host = event.currentTarget.parentElement;
    host?.style.setProperty("transition-property", "none");
    const row = container.clientWidth;
    const panelFor = (value: number) => workbenchPanelWidth(row, row - value);
    return {
      width,
      edge: "left",
      // The widest and narrowest the panel can be: the dock at its floor, and at its cap.
      bounds: { min: panelFor(0), max: panelFor(row) },
      resize(value) {
        const next = panelFor(value);
        host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${next}px`);
        return next;
      },
      finish(finalWidth) {
        const nextDock = chatDockWidth(row, row - finalWidth);
        setDock(nextDock);
        setRowWidth(row);
        try {
          setLocalStorageItem(CHAT_DOCK_WIDTH_STORAGE_KEY, nextDock, WidthSchema);
        } catch (error) {
          console.error("Could not persist the chat dock width.", error);
        }
      },
      cleanup(committed) {
        host?.style.removeProperty("transition-property");
        if (!committed) host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${width}px`);
      },
    };
  });

  // The row is measured above, from `container`, so the panel host has nothing to observe.
  return { width, handlers, observeRow: () => () => {} };
}

/**
 * The right panel's size hook for the chat view: the workbench's in a
 * workbench build, T3's otherwise. Chosen once, by the build, so only one of
 * them ever runs: T3's re-measures on every frame of a resize.
 */
export const useChatPanelInlineSize: typeof usePreviewPanelInlineSize = WORKBENCH_LAYOUT
  ? useWorkbenchPanelSize
  : usePreviewPanelInlineSize;
