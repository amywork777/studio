import { createFileRoute, redirect } from "@tanstack/react-router";

import { UsagePage } from "../components/usage/UsagePage";
import { isEngineeringInterface } from "../components/workbench/studioInterface";

export const Route = createFileRoute("/_chat/usage")({
  // The engineering interface has no usage page: an old link or history entry lands on Home.
  beforeLoad: () => {
    if (isEngineeringInterface()) throw redirect({ to: "/", replace: true });
  },
  component: UsagePage,
});
