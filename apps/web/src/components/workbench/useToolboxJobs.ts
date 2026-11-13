import type { EnvironmentId } from "@t3tools/contracts";

import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { type HardwareActionMenu, hardwareActions } from "./hardwareActions";

/**
 * Every job the environment's enabled plugins have skills for, whatever file it works on, by menu
 * (`hardwareActions`), with whether the plugin list is still loading or could not be had, and a
 * retry for when it could not. The Toolbox shows them all and dims the ones that do not fit the
 * file in front (`jobFits`).
 */
export function useToolboxJobs(
  environmentId: EnvironmentId,
  process?: string,
): {
  readonly status: "loading" | "ready" | "failed";
  readonly menus: HardwareActionMenu[];
  readonly retry: () => void;
} {
  const list = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} }));
  const skills = new Set(
    (list.data?.plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
  );
  const menus = hardwareActions(null, skills, process);
  const status = list.data !== null ? "ready" : list.error !== null ? "failed" : "loading";
  return { status, menus, retry: list.refresh };
}
