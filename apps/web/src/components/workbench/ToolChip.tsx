import type { LucideIcon } from "lucide-react";

import { ContextChip, ContextChipLabel } from "../ContextChip";
import type { HardwareAction } from "./hardwareActions";
import { MENU_TINTS } from "./kinds";
import { toolIcon } from "./toolIcons";

/** The tool a message came from (`toolUsed`), as the chat and the queue name it. */
export function ToolChip(props: { readonly tool: HardwareAction }) {
  return <ToolChipBody tool={props.tool} icon={toolIcon(props.tool)} />;
}

function ToolChipBody(props: { readonly tool: HardwareAction; readonly icon: LucideIcon }) {
  const { tool, icon: Icon } = props;
  return (
    <ContextChip>
      <Icon aria-hidden="true" className={MENU_TINTS[tool.group]} />
      <ContextChipLabel>{tool.label}</ContextChipLabel>
    </ContextChip>
  );
}
