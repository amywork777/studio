import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, InstalledPlugin } from "@t3tools/contracts";
import { ShapesIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { Switch } from "../../ui/switch";
import {
  INDUSTRIES,
  INDUSTRY_CATALOG_QUERY,
  type Industry,
  type IndustryStanding,
  industryStanding,
} from "../industries";
import { KIND_TINT } from "../kinds";
import { MODULE_HEADING } from "../studioLayout";

/**
 * What the person makes, at the head of the Toolbox page: each industry with a switch that turns
 * its plugin on (installing it the first time) or off. On, the agent has its skill and a part's
 * Toolbox has its jobs. The two built into text-to-cad are listed with no switch. Nothing shows in
 * a build that carries no industry plugin, where there would be nothing to turn on.
 */
interface IndustryRow {
  readonly industry: Industry;
  readonly standing: IndustryStanding;
}

export function Industries(props: {
  readonly environmentId: EnvironmentId;
  /** The installed plugins; undefined until they are known. */
  readonly plugins: ReadonlyArray<InstalledPlugin> | undefined;
}) {
  const { environmentId, plugins } = props;
  const catalog = useEnvironmentQuery(
    pluginEnvironment.catalog({ environmentId, input: { query: INDUSTRY_CATALOG_QUERY } }),
  );
  const canManage = useAtomValue(pluginEnvironment.install.permissionAtom(environmentId));
  const install = useAtomCommand(pluginEnvironment.install, { reportFailure: false });
  const setEnabled = useAtomCommand(pluginEnvironment.setEnabled, { reportFailure: false });
  // One change at a time: each rewrites the environment's plugins.
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ readonly id: string; readonly why: string } | null>(null);

  if (plugins === undefined) return null;
  const rows = INDUSTRIES.flatMap((industry): IndustryRow[] => {
    const standing = industryStanding(industry, plugins, catalog.data?.entries ?? []);
    return standing === null ? [] : [{ industry, standing }];
  });
  if (rows.every((row) => row.standing.state === "built-in")) return null;

  const turn = async (industry: Industry, standing: IndustryStanding, on: boolean) => {
    if (standing.state === "built-in") return;
    setFailed(null);
    setBusy(industry.id);
    const first =
      standing.state === "listed"
        ? await install({ environmentId, input: { key: standing.key } })
        : await setEnabled({ environmentId, input: { pluginId: standing.pluginId, enabled: on } });
    // A plugin just installed is turned on, where installing it did not.
    const result =
      first._tag === "Success" && standing.state === "listed" && !first.value.enabled
        ? await setEnabled({ environmentId, input: { pluginId: first.value.id, enabled: true } })
        : first;
    setBusy(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      setFailed({
        id: industry.id,
        why: error instanceof Error && error.message.trim() !== "" ? error.message : "",
      });
    }
  };

  return (
    <IndustryList
      rows={rows}
      locked={!canManage || busy !== null}
      failed={failed}
      onTurn={(row, on) => void turn(row.industry, row.standing, on)}
    />
  );
}

/** The list itself: each industry's name and what it makes, with its switch or "Built in". */
function IndustryList(props: {
  readonly rows: ReadonlyArray<IndustryRow>;
  /** No switch takes a press: a change is under way, or this connection may not change plugins. */
  readonly locked: boolean;
  /** The industry whose last change failed, and why where the server said. */
  readonly failed: { readonly id: string; readonly why: string } | null;
  readonly onTurn: (row: IndustryRow, on: boolean) => void;
}) {
  const { rows, failed } = props;
  return (
    <section aria-label="Industries" className="@container flex min-w-0 flex-col gap-3 pb-6">
      <h2 className={cn(MODULE_HEADING, "items-center border-b border-border pb-2")}>
        <ShapesIcon aria-hidden="true" className={cn("size-4 shrink-0", KIND_TINT)} />
        Industries
      </h2>
      <p className="text-xs text-muted-foreground">
        The agent tells a project's industry from its first request and sets it in the project's
        setup; that industry's jobs then lead its Toolbox. Turn off one you never use.
      </p>
      <ul role="list" className="grid min-w-0 gap-x-8 @2xl:grid-cols-2">
        {rows.map(({ industry, standing }) => (
          <li
            key={industry.id}
            className="flex min-w-0 items-center gap-3 border-b border-border/50 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium text-foreground">{industry.name}</span>
              <span className="text-xs text-muted-foreground">{industry.makes}</span>
              {failed?.id === industry.id ? (
                <span role="alert" className="text-xs text-destructive-foreground">
                  {`Couldn't turn ${industry.name} ${standing.on ? "off" : "on"}. ${failed.why}`.trim()}
                </span>
              ) : null}
            </div>
            {standing.state === "built-in" ? (
              <span className="shrink-0 text-xs text-muted-foreground">Built in</span>
            ) : (
              <Switch
                size="sm"
                aria-label={`${standing.on ? "Turn off" : "Turn on"} ${industry.name}`}
                checked={standing.on}
                disabled={props.locked}
                onCheckedChange={(on) => props.onTurn({ industry, standing }, on)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
