import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";

import { serverEnvironment } from "~/state/server";
import { gitInstallSteps } from "./gitInstall";

/** What to install so projects keep versions, said for the computer the projects are on. */
export function GitInstallSteps(props: { readonly environmentId: EnvironmentId }) {
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(props.environmentId));
  const steps = gitInstallSteps(serverConfig?.environment.platform.os);
  return (
    <>
      {steps.before}
      {steps.command === null ? null : (
        <code className="font-mono text-foreground select-all">{steps.command}</code>
      )}
      {steps.after}
    </>
  );
}
