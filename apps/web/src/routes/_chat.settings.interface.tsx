import { createFileRoute, redirect } from "@tanstack/react-router";

import { StudioInterfaceSettingsPanel } from "../components/workbench/StudioInterfaceSetting";
import { STUDIO_INTERFACE_AVAILABLE } from "../components/workbench/studioInterface";

export const Route = createFileRoute("/_chat/settings/interface")({
  // Only a Studio brand has an interface to switch; elsewhere the page has nothing to show.
  beforeLoad: () => {
    if (!STUDIO_INTERFACE_AVAILABLE) throw redirect({ to: "/settings", replace: true });
  },
  component: StudioInterfaceSettingsPanel,
});
