import { ToolCaseIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * The title bar's Toolbox button, the one way into the Toolbox (`ToolboxPopup` hangs under it).
 * Icon only, but a button of the same family as Import and New beside it: `outline`, their height.
 */
export function ToolboxButton(props: {
  readonly open: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex shrink-0" />}>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={props.label}
          aria-haspopup="dialog"
          aria-expanded={props.open}
          // Pressed while its popup is open, as Import's menu trigger is.
          data-pressed={props.open ? "" : undefined}
          data-right-panel-toggle=""
          disabled={props.disabled}
          onClick={props.onToggle}
        >
          <ToolCaseIcon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.label}</TooltipPopup>
    </Tooltip>
  );
}
