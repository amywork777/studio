import { BoxIcon } from "lucide-react";

import { ContextChip, ContextChipLabel } from "../ContextChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * What the model view sent with a message (`viewMessageOf`): its picks as one chip ("LED module ·
 * 1 face"), the whole of it in the chip's tooltip. The agent reads it as it was sent.
 */
export function ViewContextChip(props: { readonly label: string; readonly about: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<ContextChip data-view-context="" />}>
        <BoxIcon aria-hidden="true" />
        <ContextChipLabel>{props.label}</ContextChipLabel>
      </TooltipTrigger>
      <TooltipPopup side="top" variant="code">
        <pre className="max-w-96 whitespace-pre-wrap break-all">{props.about}</pre>
      </TooltipPopup>
    </Tooltip>
  );
}
