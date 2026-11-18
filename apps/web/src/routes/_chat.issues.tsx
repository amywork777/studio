import { createFileRoute, redirect } from "@tanstack/react-router";

import { IssuesPage } from "../components/issue/IssuesPage";
import { issuesSearchFromUrl } from "../components/issue/issuesSearch.logic";
import { t3FeatureHidden } from "../components/workbench/hiddenT3Features";

export const Route = createFileRoute("/_chat/issues")({
  beforeLoad: () => {
    if (t3FeatureHidden("issues")) throw redirect({ to: "/", replace: true });
  },
  validateSearch: issuesSearchFromUrl,
  component: IssuesPage,
});
