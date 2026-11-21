import { ToolCaseIcon } from "lucide-react";

import { Button } from "../ui/button";

/**
 * The title bar's Toolbox button (`ToolboxPopup` hangs under it): named, as Import and New beside it
 * are, so the Toolbox is found without hunting for an icon. `outline`, their height.
 */
export function ToolboxButton(props: {
  readonly open: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <span className="flex shrink-0">
      <Button
        variant="outline"
        size="sm"
        aria-label={props.label}
        title={props.label}
        aria-haspopup="dialog"
        aria-expanded={props.open}
        // Pressed while its popup is open, as Import's menu trigger is.
        data-pressed={props.open ? "" : undefined}
        data-right-panel-toggle=""
        disabled={props.disabled}
        onClick={props.onToggle}
      >
        <ToolCaseIcon aria-hidden="true" />
        Toolbox
      </Button>
    </span>
  );
}
