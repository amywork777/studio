import { createFileRoute, redirect } from "@tanstack/react-router";

import { GuestPage } from "../components/guest/GuestPage";
import { t3FeatureHidden } from "../components/workbench/hiddenT3Features";

export const Route = createFileRoute("/guest")({
  beforeLoad: () => {
    if (t3FeatureHidden("remoteAccess")) throw redirect({ to: "/", replace: true });
  },
  component: GuestPage,
});
