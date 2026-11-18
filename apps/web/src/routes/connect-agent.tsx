import { createFileRoute, redirect } from "@tanstack/react-router";

import { ConnectAgentSurface } from "../components/auth/ConnectAgentSurface";
import { t3FeatureHidden } from "../components/workbench/hiddenT3Features";

export const Route = createFileRoute("/connect-agent")({
  beforeLoad: () => {
    if (t3FeatureHidden("remoteAccess")) throw redirect({ to: "/", replace: true });
  },
  component: ConnectAgentSurface,
});
