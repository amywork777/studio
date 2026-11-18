import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { ProcessSignalActions } from "./ProcessSignalActions";
import { AuthEnvironmentMaintainScope } from "@t3tools/contracts";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BatteryIcon,
  CpuIcon,
  DatabaseIcon,
  GaugeIcon,
  HardDriveIcon,
  MemoryStickIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import type {
  BackgroundBooleanState,
  EnvironmentId,
  ResourceAttributionEntry,
  ResourceTelemetryAggregate,
  ResourceTelemetryHistoryBucket,
  ResourceTelemetryIoSemantics,
  ResourceTelemetryProcess,
  ResourceTelemetryProcessCategory,
  ResourceTelemetryProcessSummary,
  ResourceTelemetrySourceHealth,
  ResourceTelemetrySourceStatus,
  ServerProcessSignal,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { RegistryContext } from "@effect/atom-react";
import { useContext, useRef, useState, type ReactNode } from "react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { msg, T, useGT, useMessages, Var } from "gt-react";
import { m, type MessageResolver } from "../../i18n/messages";

import {
  useResourceTelemetry,
  useResourceTelemetryHistory,
} from "../../lib/resourceTelemetryState";
import { cn } from "../../lib/utils";
import { formatBytes } from "../../lib/formatBytes";
import { ensureLocalApi } from "../../localApi";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { useRelativeTimeState } from "../../hooks/useRelativeTimeState";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import {
  formatCpuTime,
  formatSamplingStatus,
  processIdentityKey,
  resourceHistoryBarHeight,
  resourceHistoryCpuScaleMax,
  shouldShowResourceMonitorRetry,
  visibleResourceTelemetryProcesses,
} from "./ResourceTelemetryDiagnostics.logic";
import { SettingsSection } from "./settingsLayout";
import { MODULE_HEADING } from "../workbench/studioLayout";

const HISTORY_WINDOWS = [
  { label: "5m", windowMs: 5 * 60_000, bucketMs: 15_000 },
  { label: "15m", windowMs: 15 * 60_000, bucketMs: 30_000 },
  { label: "30m", windowMs: 30 * 60_000, bucketMs: 60_000 },
  { label: "1h", windowMs: 60 * 60_000, bucketMs: 2 * 60_000 },
] as const;

function formatRate(value: number): string {
  return `${formatBytes(value)}/s`;
}

function formatDurationMicros(value: number): string {
  if (value < 1_000) return `${Math.round(value)} µs`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(2).replace(/\.0+$/, "")} ms`;
  return `${(value / 1_000_000).toFixed(2).replace(/\.0+$/, "")} s`;
}

function formatProcessName(process: Pick<ResourceTelemetryProcess, "command" | "name">): string {
  if (process.name.trim()) return process.name;
  const firstToken = process.command.trim().split(/\s+/)[0] ?? process.command;
  const normalized = firstToken.replace(/^['"]|['"]$/g, "");
  return normalized.split(/[\\/]/).findLast((segment) => segment.length > 0) ?? normalized;
}

function categoryLabel(
  category: ResourceTelemetryProcessCategory,
  resolve: MessageResolver = m,
): string {
  switch (category) {
    case "server":
      return resolve(msg("Server"));
    case "server-child":
      return resolve(msg("Backend child"));
    case "provider-root":
      return resolve(msg("Provider"));
    case "terminal-root":
      return resolve(msg("Terminal"));
    case "electron-main":
      return resolve(msg("Electron main"));
    case "electron-renderer":
      return resolve(msg("Renderer"));
    case "electron-gpu":
      return "GPU";
    case "electron-utility":
      return resolve(msg("Electron utility"));
    case "resource-monitor":
      return resolve(msg("Monitor"));
    case "unknown-t3":
      return resolve(msg("T3 process"));
  }
}

function ioSemanticsLabel(
  semantics: ResourceTelemetryIoSemantics,
  resolve: MessageResolver = m,
): string {
  switch (semantics) {
    case "storage":
      return resolve(msg("Storage bytes"));
    case "logical":
      return resolve(msg("Logical bytes"));
    case "all-io":
      return resolve(msg("All I/O bytes"));
    case "unavailable":
      return resolve(msg("Unavailable"));
  }
}

function booleanStateLabel(
  value: BackgroundBooleanState,
  labels: { readonly true: string; readonly false: string },
  resolve: MessageResolver = m,
): string {
  if (value === "true") return labels.true;
  if (value === "false") return labels.false;
  return resolve(msg("Unknown"));
}

function sourceStatusTone(status: ResourceTelemetrySourceStatus): "default" | "warning" | "danger" {
  if (status === "healthy") return "default";
  if (status === "starting" || status === "degraded") return "warning";
  return "danger";
}

const STATUS_BADGE = {
  neutral: "outline",
  default: "success",
  warning: "warning",
  danger: "error",
} as const;

function SourceStatusBadge({
  label,
  status,
  presentation,
}: {
  label: string;
  status: ResourceTelemetrySourceStatus;
  presentation?:
    | {
        readonly label: string;
        readonly tone: "neutral";
      }
    | undefined;
}) {
  const tone = presentation?.tone ?? sourceStatusTone(status);
  const state = presentation?.label ?? status;
  return (
    <Badge variant={STATUS_BADGE[tone]}>
      {label ? `${label} ${state}` : `${state.charAt(0).toUpperCase()}${state.slice(1)}`}
    </Badge>
  );
}

function LastSampleLabel({ sampledAt }: { sampledAt: DateTime.Utc | null }) {
  const relative = useRelativeTimeState(sampledAt ? DateTime.formatIso(sampledAt) : null);
  if (relative.status !== "relative") {
    return (
      <span className="text-xs text-muted-foreground/55">
        <T>Waiting for sample</T>
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground/60">
      {relative.suffix ? (
        <T context="the time is an elapsed time such as 5m">
          Updated{" "}
          <span className="tabular-nums">
            <Var>{relative.value}</Var>
          </span>{" "}
          ago
        </T>
      ) : (
        <T>
          Updated{" "}
          <span className="tabular-nums">
            <Var>{relative.value}</Var>
          </span>
        </T>
      )}
    </span>
  );
}

function IconStat({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string | undefined;
  tone?: "default" | "warning" | "missing";
}) {
  return (
    <div className="group min-w-0 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-muted-foreground/55 transition-colors group-hover:text-foreground/65">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "mt-2.5 truncate text-2xl font-semibold tracking-tighter tabular-nums text-foreground",
          tone === "warning" && "text-warning-foreground",
          tone === "missing" &&
            "text-sm leading-8 font-normal tracking-normal text-muted-foreground",
        )}
      >
        {value}
      </div>
      {detail ? (
        <div className="mt-1.5 truncate text-xs text-muted-foreground/60">{detail}</div>
      ) : null}
    </div>
  );
}

function AggregateCard({
  label,
  aggregate,
}: {
  label: string;
  aggregate: ResourceTelemetryAggregate;
}) {
  const gt = useGT();
  return (
    <div className="border-t border-border/60 p-3 first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0">
      <div className="flex items-center justify-between gap-3">
        <div className={MODULE_HEADING}>{label}</div>
        <div className="rounded-md bg-muted/55 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground/70">
          {aggregate.processCount} {aggregate.processCount === 1 ? "process" : "processes"}
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
        <MetricPair label={gt("CPU")} value={`${aggregate.currentCpuPercent.toFixed(1)}%`} />
        <MetricPair label={gt("Memory")} value={formatBytes(aggregate.currentRssBytes)} />
        <MetricPair label={gt("Read")} value={formatRate(aggregate.ioReadBytesPerSecond)} />
        <MetricPair label={gt("Write")} value={formatRate(aggregate.ioWriteBytesPerSecond)} />
      </div>
    </div>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-xs font-medium tabular-nums text-foreground/90">{value}</div>
    </div>
  );
}

function HealthSource({ label, health }: { label: string; health: ResourceTelemetrySourceHealth }) {
  const gt = useGT();
  const expectedInBrowser =
    health.status === "unavailable" &&
    Option.exists(health.lastError, (error) => error.includes("'web' mode"));
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/50 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground/65">
          {expectedInBrowser
            ? gt("Available when this page runs inside the desktop app.")
            : Option.match(health.lastError, {
                onNone: () => gt("No reported errors"),
                onSome: (error) => error,
              })}
        </div>
      </div>
      <SourceStatusBadge
        label=""
        status={health.status}
        presentation={
          expectedInBrowser
            ? {
                label: gt("Desktop only"),
                tone: "neutral",
              }
            : undefined
        }
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/50 py-3 first:border-t-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-xs tabular-nums text-foreground/85",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function HistoryWindowSelector({
  selectedWindowMs,
  onSelect,
}: {
  selectedWindowMs: number;
  onSelect: (windowMs: number) => void;
}) {
  const gt = useGT();
  return (
    <ToggleGroup
      aria-label={gt("Resource history period")}
      variant="segmented"
      value={[String(selectedWindowMs)]}
      onValueChange={(next) => {
        const selected = HISTORY_WINDOWS.find((option) => String(option.windowMs) === next[0]);
        if (selected) onSelect(selected.windowMs);
      }}
    >
      {HISTORY_WINDOWS.map((option) => (
        <Toggle key={option.windowMs} value={String(option.windowMs)}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

function ResourceHistoryChart({
  buckets,
}: {
  buckets: ReadonlyArray<ResourceTelemetryHistoryBucket>;
}) {
  const gt = useGT();
  const maxCpu = resourceHistoryCpuScaleMax(buckets);
  const maxIo = Math.max(1, ...buckets.map((bucket) => bucket.ioReadBytes + bucket.ioWriteBytes));

  return (
    <div className="border-t border-border/60 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/65">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-3 rounded-full bg-foreground/70" /> <T>CPU average</T>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-3 rounded-full bg-info/70" /> <T>I/O reads</T>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-3 rounded-full bg-muted-foreground/45" /> <T>I/O writes</T>
        </span>
      </div>
      <div className="flex h-32 items-end gap-1 overflow-hidden rounded-lg border border-border/40 bg-muted/8 px-2 pt-3 pb-2">
        {buckets.map((bucket) => {
          const cpuHeight = resourceHistoryBarHeight({
            value: bucket.avgCpuPercent,
            max: maxCpu,
            minimumVisiblePercent: 2,
          });
          const readHeight = resourceHistoryBarHeight({
            value: bucket.ioReadBytes,
            max: maxIo,
            minimumVisiblePercent: 1,
          });
          const writeHeight = resourceHistoryBarHeight({
            value: bucket.ioWriteBytes,
            max: maxIo,
            minimumVisiblePercent: 1,
          });
          return (
            <Tooltip key={DateTime.formatIso(bucket.startedAt)}>
              <TooltipTrigger
                render={
                  <div className="grid h-full min-w-1 flex-1 grid-cols-3 items-end gap-px">
                    <span
                      className="block rounded-t-sm bg-foreground/65"
                      style={{ height: `${cpuHeight}%` }}
                    />
                    <span
                      className="block rounded-t-sm bg-info/70"
                      style={{ height: `${readHeight}%` }}
                    />
                    <span
                      className="block rounded-t-sm bg-muted-foreground/45"
                      style={{ height: `${writeHeight}%` }}
                    />
                  </div>
                }
              />
              <TooltipPopup side="top" className="text-left">
                <div className="space-y-0.5">
                  <div>
                    {gt("CPU avg {percent}%", { percent: bucket.avgCpuPercent.toFixed(1) })}
                  </div>
                  <div>
                    {gt("CPU peak {percent}%", { percent: bucket.maxCpuPercent.toFixed(1) })}
                  </div>
                  <div>{gt("Read {bytes}", { bytes: formatBytes(bucket.ioReadBytes) })}</div>
                  <div>{gt("Write {bytes}", { bytes: formatBytes(bucket.ioWriteBytes) })}</div>
                </div>
              </TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function ProcessTreeName({
  process,
  collapsed,
  onToggle,
}: {
  process: ResourceTelemetryProcess;
  collapsed: boolean;
  onToggle: (process: ResourceTelemetryProcess) => void;
}) {
  const gt = useGT();
  const name = formatProcessName(process);
  const hasChildren = process.childPids.length > 0;
  return (
    <div
      className="grid min-w-0 grid-cols-[1.25rem_0.375rem_minmax(0,1fr)] items-center gap-2"
      style={{ paddingLeft: `${Math.min(process.depth, 7) * 10}px` }}
    >
      {hasChildren ? (
        <Button
          size="icon-micro"
          variant="ghost-muted"
          onClick={() => onToggle(process)}
          aria-label={collapsed ? gt("Expand {name}", { name }) : gt("Collapse {name}", { name })}
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </Button>
      ) : (
        <span className="size-5" aria-hidden />
      )}
      <span className="size-1.5 rounded-full bg-muted-foreground/55" />
      <Tooltip>
        <TooltipTrigger
          render={<span className="min-w-0 truncate font-medium text-foreground">{name}</span>}
        />
        <TooltipPopup side="top" variant="code">
          {process.command || process.name}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

function canSignalProcess(process: ResourceTelemetryProcess): boolean {
  return (
    process.category === "server-child" ||
    process.category === "provider-root" ||
    process.category === "terminal-root"
  );
}

function ProcessActions({
  process,
  canMaintainEnvironment,
  signalingKeys,
  onSignal,
}: {
  process: ResourceTelemetryProcess;
  canMaintainEnvironment: boolean;
  signalingKeys: ReadonlySet<string>;
  onSignal: (process: ResourceTelemetryProcess, signal: ServerProcessSignal) => void;
}) {
  if (!canSignalProcess(process)) {
    return <span className="text-xs text-muted-foreground/35">-</span>;
  }
  const isSignaling = signalingKeys.has(processIdentityKey(process));
  return (
    <ProcessSignalActions
      disabled={!canMaintainEnvironment || isSignaling}
      onSignal={(signal) => onSignal(process, signal)}
    />
  );
}

function ProcessTable({
  processes,
  canMaintainEnvironment,
  signalingKeys,
  onSignal,
}: {
  processes: ReadonlyArray<ResourceTelemetryProcess>;
  canMaintainEnvironment: boolean;
  signalingKeys: ReadonlySet<string>;
  onSignal: (process: ResourceTelemetryProcess, signal: ServerProcessSignal) => void;
}) {
  const messages = useMessages();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const visible = visibleResourceTelemetryProcesses(processes, collapsed);
  const toggle = (process: ResourceTelemetryProcess) => {
    const identityKey = processIdentityKey(process);
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(identityKey)) {
        next.delete(identityKey);
      } else {
        next.add(identityKey);
      }
      return next;
    });
  };

  return (
    <div className="border-t border-border/60">
      <ScrollArea
        chainVerticalScroll
        scrollFade
        hideScrollbars
        className="max-h-[min(68vh,48rem)] w-full max-w-full"
      >
        <table className="w-full min-w-[1320px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[4%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-card text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-normal sm:pl-5">
                <T>Process</T>
              </th>
              <th className="px-3 py-2 font-normal">
                <T>Category</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>CPU</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>CPU time</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Memory</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Read/s</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Write/s</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Read total</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Write total</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>PID</T>
              </th>
              <th className="px-2 py-2 text-right font-normal sm:pr-4">
                <T>Kill</T>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-5 text-xs text-muted-foreground">
                  <T>Waiting for the native process monitor.</T>
                </td>
              </tr>
            ) : null}
            {visible.map((process) => (
              <tr key={processIdentityKey(process)} className="hover:bg-muted/20">
                <td className="p-3 sm:pl-5">
                  <ProcessTreeName
                    process={process}
                    collapsed={collapsed.has(processIdentityKey(process))}
                    onToggle={toggle}
                  />
                </td>
                <td className="truncate px-3 py-2 text-xs text-muted-foreground">
                  {categoryLabel(process.category, messages)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {process.cpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCpuTime(process.cpuTimeMs / 1_000, messages)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatBytes(process.residentBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatRate(process.ioReadBytesPerSecond)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatRate(process.ioWriteBytesPerSecond)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatBytes(process.ioReadBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger render={<span>{formatBytes(process.ioWriteBytes)}</span>} />
                    <TooltipPopup side="top">
                      {ioSemanticsLabel(process.ioSemantics, messages)}
                    </TooltipPopup>
                  </Tooltip>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {process.identity.pid}
                </td>
                <td className="px-2 py-2 text-right sm:pr-4">
                  <ProcessActions
                    process={process}
                    canMaintainEnvironment={canMaintainEnvironment}
                    signalingKeys={signalingKeys}
                    onSignal={onSignal}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function HistoryProcessTable({
  processes,
}: {
  processes: ReadonlyArray<ResourceTelemetryProcessSummary>;
}) {
  const messages = useMessages();
  return (
    <div className="border-t border-border/60">
      <ScrollArea
        chainVerticalScroll
        scrollFade
        hideScrollbars
        className="max-h-[28rem] w-full max-w-full"
      >
        <table className="w-full min-w-[1020px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[7%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-card text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-normal sm:pl-5">
                <T>Process</T>
              </th>
              <th className="px-3 py-2 font-normal">
                <T>Category</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>CPU time</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Peak CPU</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Peak mem</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Read</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Write</T>
              </th>
              <th className="px-3 py-2 text-right font-normal">
                <T>Samples</T>
              </th>
              <th className="px-3 py-2 text-right font-normal sm:pr-5">
                <T>PID</T>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {processes.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-5 text-xs text-muted-foreground">
                  <T>No retained process samples in this window.</T>
                </td>
              </tr>
            ) : null}
            {processes.map((process) => (
              <tr key={processIdentityKey(process)} className="hover:bg-muted/20">
                <td className="p-3 sm:pl-5">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="block truncate font-medium text-foreground">
                          {process.name || process.command}
                        </span>
                      }
                    />
                    <TooltipPopup side="top" variant="code">
                      {process.command || process.name}
                    </TooltipPopup>
                  </Tooltip>
                </td>
                <td className="truncate px-3 py-2 text-xs text-muted-foreground">
                  {categoryLabel(process.category, messages)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCpuTime(process.cpuTimeMs / 1_000, messages)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {process.maxCpuPercent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatBytes(process.peakRssBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatBytes(process.ioReadBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatBytes(process.ioWriteBytes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {process.sampleCount}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground sm:pr-5">
                  {process.identity.pid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function AttributionTable({ entries }: { entries: ReadonlyArray<ResourceAttributionEntry> }) {
  return (
    <div className="overflow-x-auto border-t border-border/60">
      <table className="w-full min-w-[720px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[28%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead className="border-b border-border/60 text-xs text-muted-foreground">
          <tr>
            <th className="p-3 font-normal sm:pl-5">
              <T>Component</T>
            </th>
            <th className="px-3 py-2 font-normal">
              <T>Operation</T>
            </th>
            <th className="px-3 py-2 text-right font-normal">
              <T>Logical read</T>
            </th>
            <th className="px-3 py-2 text-right font-normal">
              <T>Logical write</T>
            </th>
            <th className="px-3 py-2 text-right font-normal">
              <T>Count</T>
            </th>
            <th className="px-3 py-2 text-right font-normal sm:pr-5">
              <T>Time</T>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {entries.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-5 text-xs text-muted-foreground">
                <T>No instrumented application I/O has been recorded yet.</T>
              </td>
            </tr>
          ) : null}
          {entries.map((entry) => (
            <tr key={`${entry.component}:${entry.operation}`} className="hover:bg-muted/20">
              <td className="truncate p-3 font-medium text-foreground sm:pl-5">
                {entry.component}
              </td>
              <td className="truncate px-3 py-2 text-muted-foreground">{entry.operation}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatBytes(entry.logicalReadBytes)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatBytes(entry.logicalWriteBytes)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{entry.count}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground sm:pr-5">
                {(entry.durationMs / 1_000).toFixed(2).replace(/\.0+$/, "")}s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResourceTelemetryDiagnostics({
  environmentId,
}: {
  environmentId: EnvironmentId | null;
}) {
  // Pending signals and retries belong to one environment, so a switch starts fresh.
  return (
    <ResourceTelemetryDiagnosticsBody key={environmentId ?? ""} environmentId={environmentId} />
  );
}

function ResourceTelemetryDiagnosticsBody({
  environmentId,
}: {
  environmentId: EnvironmentId | null;
}) {
  const messages = useMessages();
  const gt = useGT();
  const registry = useContext(RegistryContext);
  const [windowMs, setWindowMs] = useState(15 * 60_000);
  const selectedWindow =
    HISTORY_WINDOWS.find((option) => option.windowMs === windowMs) ?? HISTORY_WINDOWS[1];
  const canMaintainEnvironment = useEnvironmentScope(environmentId, AuthEnvironmentMaintainScope);
  const telemetry = useResourceTelemetry(environmentId);
  const retryTelemetry = telemetry.retry;
  const history = useResourceTelemetryHistory(
    {
      windowMs: selectedWindow.windowMs,
      bucketMs: selectedWindow.bucketMs,
    },
    environmentId,
  );
  const signalServerProcess = useAtomCommand(serverEnvironment.signalProcess, {
    reportFailure: false,
  });
  const [signalingKeys, setSignalingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const signalingKeysRef = useRef<ReadonlySet<string>>(new Set());
  const [isRetrying, setIsRetrying] = useState(false);
  const snapshot = telemetry.data;
  const allT3 = snapshot?.groups.allT3;

  const signalProcess = async (process: ResourceTelemetryProcess, signal: ServerProcessSignal) => {
    const targetEnvironmentId = environmentId;
    if (
      targetEnvironmentId === null ||
      !readEnvironmentScope(targetEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    const identityKey = processIdentityKey(process);
    if (signalingKeysRef.current.has(identityKey)) return;
    const nextSignalingKeys = new Set(signalingKeysRef.current).add(identityKey);
    signalingKeysRef.current = nextSignalingKeys;
    setSignalingKeys(nextSignalingKeys);
    const clearSignaling = () => {
      const next = new Set(signalingKeysRef.current);
      next.delete(identityKey);
      signalingKeysRef.current = next;
      setSignalingKeys(next);
    };

    if (signal === "SIGKILL") {
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          gt("Send SIGKILL to process {pid}? This cannot be handled by the process.", {
            pid: process.identity.pid,
          }),
          { variant: "destructive" },
        );
      } catch (error) {
        clearSignaling();
        toastManager.add({
          type: "error",
          title: gt("Could not confirm signal"),
          description:
            error instanceof Error
              ? (thrownErrorMessage(error, m) ?? error.message)
              : gt("Failed to send {signal}.", { signal }),
        });
        return;
      }
      if (!confirmed) {
        clearSignaling();
        return;
      }
    }
    if (!readEnvironmentScope(targetEnvironmentId, AuthEnvironmentMaintainScope)) {
      clearSignaling();
      return;
    }
    void signalServerProcess({
      environmentId: targetEnvironmentId,
      input: {
        pid: process.identity.pid,
        startTimeMs: process.identity.startTimeMs,
        signal,
      },
    })
      .then((result) => {
        if (result._tag === "Failure") {
          if (isAtomCommandInterrupted(result)) return;
          throw squashAtomCommandFailure(result);
        }
        if (result.value.signaled) return;
        toastManager.add({
          type: "error",
          title: gt("Could not send {signal}", { signal }),
          description: Option.getOrElse(result.value.message, () =>
            gt("Failed to send {signal} to process {pid}.", {
              signal,
              pid: process.identity.pid,
            }),
          ),
        });
      })
      .catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: gt("Could not send {signal}", { signal }),
          description:
            error instanceof Error
              ? (thrownErrorMessage(error, m) ?? error.message)
              : gt("Failed to send {signal}.", { signal }),
        });
      })
      .finally(() => {
        clearSignaling();
      });
  };

  const retryCollector = () => {
    if (
      environmentId === null ||
      !readEnvironmentScope(environmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsRetrying(true);
    void retryTelemetry()
      .then(() => {
        // The user can pick another window while the retry runs; refreshing every window
        // re-reads the one on screen and only invalidates the rest.
        for (const option of HISTORY_WINDOWS) {
          registry.refresh(
            serverEnvironment.resourceTelemetryHistory({
              environmentId,
              input: { windowMs: option.windowMs, bucketMs: option.bucketMs },
            }),
          );
        }
      })
      .catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: gt("Could not restart resource monitor"),
          description:
            error instanceof Error
              ? (thrownErrorMessage(error, m) ?? error.message)
              : gt("The resource monitor retry failed."),
        });
      })
      .finally(() => {
        setIsRetrying(false);
      });
  };

  const speedLimit = snapshot ? Option.getOrNull(snapshot.speedLimitPercent) : null;
  const collectorNeedsRetry = shouldShowResourceMonitorRetry({
    nativeStatus: snapshot?.health.native.status ?? null,
    error: telemetry.error,
  });
  const hasHostPowerSignal =
    snapshot !== null &&
    (snapshot.power.onBattery !== "unknown" ||
      snapshot.power.lowPowerMode !== "unknown" ||
      snapshot.power.idle !== "unknown" ||
      snapshot.power.locked !== "unknown" ||
      snapshot.power.thermalState !== "unknown");

  return (
    <>
      <SettingsSection
        title={gt("Resource monitor")}
        icon={<ActivityIcon className="size-4 text-muted-foreground" />}
        headerAction={
          <div className="flex items-center gap-2">
            {snapshot ? (
              <SourceStatusBadge label={gt("Native")} status={snapshot.health.native.status} />
            ) : null}
            <LastSampleLabel sampledAt={snapshot?.readAt ?? null} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-micro"
                    variant="ghost"
                    disabled={telemetry.isPending}
                    onClick={telemetry.refresh}
                    aria-label={gt("Refresh resource telemetry")}
                  >
                    <RefreshIcon size="xs" refreshing={telemetry.isPending} />
                  </Button>
                }
              />
              <TooltipPopup side="top">
                <T>Refresh telemetry snapshot</T>
              </TooltipPopup>
            </Tooltip>
          </div>
        }
      >
        <div className="overflow-hidden rounded-[inherit]">
          <div className="flex flex-col gap-3 border-b border-border/60 bg-linear-to-r from-muted/45 via-muted/20 to-transparent p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className={MODULE_HEADING}>
                <T>T3 system footprint</T>
              </div>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                <T>
                  Live native counters for the server, providers, terminals, desktop processes, and
                  the monitor itself.
                </T>
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/65">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  snapshot && snapshot.sampleIntervalMs > 0
                    ? "bg-success"
                    : "bg-muted-foreground/55",
                )}
              />
              {snapshot
                ? formatSamplingStatus(snapshot.sampleIntervalMs, messages)
                : gt("Sampling every ...")}
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border/55 md:grid-cols-3">
            <IconStat
              icon={<CpuIcon className="size-3.5" />}
              label={gt("Current CPU")}
              value={allT3 ? `${allT3.currentCpuPercent.toFixed(1)}%` : "..."}
              detail={
                allT3
                  ? gt("{time} observed CPU time", {
                      time: formatCpuTime(allT3.cpuTimeMs / 1_000, messages),
                    })
                  : undefined
              }
            />
            <IconStat
              icon={<MemoryStickIcon className="size-3.5" />}
              label={gt("Resident memory")}
              value={allT3 ? formatBytes(allT3.currentRssBytes) : "..."}
              detail={
                allT3
                  ? gt("{bytes} combined process peaks", { bytes: formatBytes(allT3.peakRssBytes) })
                  : undefined
              }
            />
            <IconStat
              icon={<ActivityIcon className="size-3.5" />}
              label={gt("Process count")}
              value={allT3 ? String(allT3.processCount) : "..."}
              detail={
                allT3
                  ? gt("{processStarts} starts · {processExits} exits", {
                      processStarts: allT3.processStarts,
                      processExits: allT3.processExits,
                    })
                  : undefined
              }
            />
            <IconStat
              icon={<HardDriveIcon className="size-3.5" />}
              label={gt("Read throughput")}
              value={allT3 ? formatRate(allT3.ioReadBytesPerSecond) : "..."}
              detail={allT3 ? `${formatBytes(allT3.ioReadBytes)} observed` : undefined}
            />
            <IconStat
              icon={<DatabaseIcon className="size-3.5" />}
              label={gt("Write throughput")}
              value={allT3 ? formatRate(allT3.ioWriteBytesPerSecond) : "..."}
              detail={allT3 ? `${formatBytes(allT3.ioWriteBytes)} observed` : undefined}
            />
            <IconStat
              icon={<GaugeIcon className="size-3.5" />}
              label={gt("CPU speed limit")}
              value={
                snapshot
                  ? speedLimit === null
                    ? gt("Unknown")
                    : `${speedLimit.toFixed(0)}%`
                  : "..."
              }
              detail={
                snapshot
                  ? gt("{thermalState} thermal state", {
                      thermalState: snapshot.power.thermalState,
                    })
                  : undefined
              }
              tone={
                snapshot && speedLimit === null
                  ? "missing"
                  : speedLimit !== null && speedLimit < 80
                    ? "warning"
                    : "default"
              }
            />
          </div>
          {telemetry.error ? (
            <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
              <span>{telemetry.error}</span>
            </div>
          ) : null}
          {snapshot ? (
            <div className="grid border-t border-border/60 bg-muted/10 md:grid-cols-3">
              <AggregateCard label={gt("Backend + agents")} aggregate={snapshot.groups.backend} />
              <AggregateCard label={gt("Desktop")} aggregate={snapshot.groups.electron} />
              <AggregateCard label={gt("Monitor overhead")} aggregate={snapshot.groups.monitor} />
            </div>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title={gt("Host & collection")}
        icon={<GaugeIcon className="size-4 text-muted-foreground" />}
        headerAction={
          collectorNeedsRetry ? (
            <Button size="sm" variant="outline" disabled={isRetrying} onClick={retryCollector}>
              <RefreshIcon size="xs" refreshing={isRetrying} />
              <T>Retry monitor</T>
            </Button>
          ) : null
        }
      >
        <div className="grid overflow-hidden rounded-[inherit] md:grid-cols-2 md:divide-x md:divide-border/60">
          <div className="p-3">
            <div className={cn(MODULE_HEADING, "mb-3 items-center")}>
              <span className="flex size-6 items-center justify-center rounded-md bg-muted/60">
                <BatteryIcon className="size-3.5" />
              </span>
              <T>Host state</T>
            </div>
            {hasHostPowerSignal && snapshot ? (
              <>
                <DetailRow
                  label={gt("Power source")}
                  value={booleanStateLabel(
                    snapshot.power.onBattery,
                    { true: gt("Battery"), false: gt("External power") },
                    messages,
                  )}
                />
                <DetailRow
                  label={gt("Low power mode")}
                  value={booleanStateLabel(
                    snapshot.power.lowPowerMode,
                    { true: gt("Enabled"), false: gt("Disabled") },
                    messages,
                  )}
                />
                <DetailRow
                  label={gt("Idle")}
                  value={`${booleanStateLabel(
                    snapshot.power.idle,
                    {
                      true: gt("Idle", { $context: "host power state" }),
                      false: gt("Active", { $context: "host power state" }),
                    },
                    messages,
                  )}${
                    snapshot.power.idleSeconds === null
                      ? ""
                      : ` · ${Math.round(snapshot.power.idleSeconds)}s`
                  }`}
                />
                <DetailRow
                  label={gt("Session")}
                  value={
                    snapshot.power.suspended
                      ? gt("Suspended")
                      : booleanStateLabel(
                          snapshot.power.locked,
                          { true: gt("Locked"), false: gt("Unlocked") },
                          messages,
                        )
                  }
                />
                <DetailRow
                  label={gt("Thermal")}
                  value={snapshot.power.thermalState}
                  valueClassName={
                    snapshot.power.thermalState === "serious" ||
                    snapshot.power.thermalState === "critical"
                      ? "text-destructive"
                      : undefined
                  }
                />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-5">
                <div className="text-sm font-medium text-foreground">
                  <T>Desktop host signals not connected</T>
                </div>
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground/70">
                  <T>
                    Power, idle, lock, and thermal state are supplied by the desktop host. Process
                    telemetry remains fully active in this browser session.
                  </T>
                </p>
              </div>
            )}
          </div>
          <div className="border-t border-border/60 p-3 md:border-t-0">
            <div className={cn(MODULE_HEADING, "mb-3 items-center")}>
              <span className="flex size-6 items-center justify-center rounded-md bg-muted/60">
                <GaugeIcon className="size-3.5" />
              </span>
              <T>Collection health</T>
            </div>
            {snapshot ? (
              <>
                <HealthSource
                  label={gt("Native process monitor")}
                  health={snapshot.health.native}
                />
                <HealthSource
                  label={gt("Electron main process")}
                  health={snapshot.health.desktop}
                />
                <DetailRow
                  label={gt("Collection time")}
                  value={formatDurationMicros(snapshot.health.collectionDurationMicros)}
                />
                <DetailRow
                  label={gt("Process scan")}
                  value={`${snapshot.health.retainedProcessCount}/${snapshot.health.scannedProcessCount} retained`}
                />
                <DetailRow
                  label={gt("Inaccessible")}
                  value={String(snapshot.health.inaccessibleProcessCount)}
                  valueClassName={
                    snapshot.health.inaccessibleProcessCount > 0
                      ? "text-warning-foreground"
                      : undefined
                  }
                />
                <DetailRow
                  label={gt("Sidecar")}
                  value={Option.match(snapshot.health.sidecarVersion, {
                    onNone: () => gt("Unavailable"),
                    onSome: (version) =>
                      `${version}${Option.match(snapshot.health.sidecarPid, {
                        onNone: () => "",
                        onSome: (pid) => ` · PID ${pid}`,
                      })}`,
                  })}
                />
                <DetailRow label={gt("Restarts")} value={String(snapshot.health.restartCount)} />
              </>
            ) : (
              <div className="py-4 text-xs text-muted-foreground">
                <T>Waiting for collector health.</T>
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={gt("Resource timeline")}
        icon={<HardDriveIcon className="size-4 text-muted-foreground" />}
        headerAction={
          <div className="flex items-center gap-2">
            <HistoryWindowSelector selectedWindowMs={windowMs} onSelect={setWindowMs} />
            <Button
              size="icon-micro"
              variant="ghost"
              disabled={history.isPending}
              onClick={history.refresh}
              aria-label={gt("Refresh resource history")}
            >
              <RefreshIcon size="xs" refreshing={history.isPending} />
            </Button>
          </div>
        }
      >
        <div className="overflow-hidden rounded-[inherit]">
          {history.error ? (
            <div className="flex items-start gap-2 border-b border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangleIcon className="size-3.5 h-lh shrink-0" />
              <span>{history.error}</span>
            </div>
          ) : null}
          <ResourceHistoryChart buckets={history.data?.buckets ?? []} />
          <HistoryProcessTable processes={history.data?.topProcesses ?? []} />
        </div>
      </SettingsSection>

      <SettingsSection
        title={gt("Live process tree")}
        icon={<CpuIcon className="size-4 text-muted-foreground" />}
        headerAction={
          snapshot ? (
            <span className="text-xs text-muted-foreground/55">
              <T>
                Identity: <span className="font-mono">PID + start time</span>
              </T>
            </span>
          ) : null
        }
      >
        <div className="overflow-hidden rounded-[inherit]">
          <ProcessTable
            processes={snapshot?.processes ?? []}
            canMaintainEnvironment={canMaintainEnvironment}
            signalingKeys={signalingKeys}
            onSignal={signalProcess}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={gt("Instrumented application I/O")}
        icon={<DatabaseIcon className="size-4 text-muted-foreground" />}
        headerAction={
          <span className="text-xs text-muted-foreground/55">
            <T>Logical bytes by operation</T>
          </span>
        }
      >
        <div className="overflow-hidden rounded-[inherit]">
          <div className="bg-muted/15 p-3 text-xs leading-relaxed text-muted-foreground">
            <T>
              Native counters identify which process is reading or writing. These application-level
              counters identify known T3 operations so process spikes can be correlated with
              specific persistence and logging paths.
            </T>
          </div>
          <AttributionTable entries={snapshot?.attribution.entries ?? []} />
        </div>
      </SettingsSection>
    </>
  );
}
