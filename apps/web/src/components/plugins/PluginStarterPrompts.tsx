import { pluginStarterPrompts } from "@t3tools/client-runtime/state/plugins";
import type { EnvironmentId } from "@t3tools/contracts";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { ProjectStarters } from "../workbench/ProjectStarters";
import { WORKBENCH_LAYOUT } from "../workbench/workbenchLayout";
import { BRAND_STARTERS, brandStarterPrompts } from "./brandStarters";

/**
 * What the enabled plugins suggest asking first, under a new thread's
 * headline (text-to-cad: "Design a 3D-printable phone stand…"), or the
 * brand's own starters when it has them. Studio's are made from the project.
 * A pick goes into the composer to edit before sending.
 */
export function PluginStarterPrompts(props: {
  readonly environmentId: EnvironmentId | null;
  readonly composerRef: ComposerHandleRef;
  /** The project's workspace root; null for no project (a scratch thread). */
  readonly cwd?: string | null;
}) {
  const list = useEnvironmentQuery(
    props.environmentId === null
      ? null
      : pluginEnvironment.list({ environmentId: props.environmentId, input: {} }),
  );
  const plugins = list.data?.plugins ?? [];
  const prompts =
    brandStarterPrompts(BRAND_STARTERS, plugins, 4) ?? pluginStarterPrompts(plugins, 3);
  // Studio suggests from the project itself, and nothing without one (`workbench/ProjectStarters.tsx`).
  if (WORKBENCH_LAYOUT) {
    return props.environmentId !== null && props.cwd ? (
      <ProjectStarters
        environmentId={props.environmentId}
        cwd={props.cwd}
        composerRef={props.composerRef}
      />
    ) : null;
  }
  if (prompts.length === 0) return null;
  return (
    <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-2">
      {prompts.map((prompt) => (
        <Button
          key={prompt}
          variant="outline"
          size="compact"
          onClick={() => {
            const composer = props.composerRef.current;
            if (!composer) return;
            composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true });
            composer.focusAtEnd();
          }}
        >
          {prompt}
        </Button>
      ))}
    </div>
  );
}
