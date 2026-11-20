import { createFileRoute } from "@tanstack/react-router";

import { EngineeringSettingsPanel } from "../components/workbench/EngineeringSettingsPanel";

export const Route = createFileRoute("/_chat/settings/engineering")({
  component: EngineeringSettingsPanel,
});
