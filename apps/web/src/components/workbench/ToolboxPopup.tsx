import type { ReactNode } from "react";

import { Popover, PopoverPopup } from "../ui/popover";

// A press on the model keeps it open so its tiles follow the part picked there; the title bar's
// button shuts it itself, so its press must not shut it first and have the button open it again.
const STAYS_OPEN_ON = "[data-right-panel-surface-content], [data-right-panel-toggle]";

const titleBarButton = () => document.querySelector("[data-right-panel-toggle]");

/**
 * The Toolbox, opened from the title bar's Toolbox button and hung under it over the model, which
 * keeps the panel's whole width. Escape, the button again or a press anywhere but the model shuts it.
 */
export function ToolboxPopup(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <Popover
      open={props.open}
      onOpenChange={(open, details) => {
        const target =
          details.reason === "focus-out"
            ? (details.event as FocusEvent).relatedTarget
            : details.reason === "outside-press"
              ? details.event.target
              : null;
        if (!open && target instanceof Element && target.closest(STAYS_OPEN_ON)) {
          details.cancel();
          return;
        }
        props.onOpenChange(open);
      }}
    >
      <PopoverPopup
        anchor={titleBarButton}
        side="bottom"
        align="end"
        padding="none"
        width="lg"
        aria-label="Toolbox"
        data-studio-toolbox
      >
        {props.children}
      </PopoverPopup>
    </Popover>
  );
}
