/**
 * Studio's SolidCraft part editor: sketch dimensions, named sizes and the feature timeline. Every
 * change goes to the thread's SolidCraft engine, the one the agent uses, and the page polls the
 * design every 1.5 s so the agent's changes show too.
 */
import { CornerDownLeft, Eye, EyeOff, Redo2, Ruler, Scan, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ModelDimension,
  type Sketch,
  sketchDimensions,
} from "../../../../apps/web/src/components/workbench/solidcraft/dimensions";
import {
  buildSummary,
  type DesignParameter,
  designPanels,
  formatValue,
  restatesValue,
  type TimelineEntry,
  type TimelineFeature,
} from "../../../../apps/web/src/components/workbench/solidcraft/designState";
import { humanName } from "../../../../apps/web/src/components/workbench/partNames";
import type { Bridge, HostContext } from "./bridge";
import { describeError, EditableValue, featureIcon } from "./controls";
import { PartViewport, type ViewportColors } from "./viewport";

interface DesignState {
  readonly unchanged: false;
  readonly revision: number | string;
  readonly name: string;
  readonly path: string | null;
  readonly dirty: boolean;
  readonly units: string;
  readonly marker: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly timeline: ReadonlyArray<TimelineEntry>;
  readonly sketches: ReadonlyArray<Sketch>;
  readonly parameters: ReadonlyArray<DesignParameter>;
  readonly mesh: string | null;
}
type StateReply = DesignState | { readonly unchanged: true; readonly revision: number | string };
interface EditReply {
  readonly ok: boolean;
  readonly errors?: ReadonlyArray<unknown>;
  readonly saved?: boolean;
}

const POLL_MS = 1500;

function readColors(): ViewportColors {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme !== "light";
  return {
    background: get("--viewport", dark ? "#1b1c1f" : "#f4f5f7"),
    model: dark ? "#c9cdd4" : "#d5d9e0",
    edge: dark ? "#2b2e34" : "#4a4f58",
    dimension: get("--accent", "#5b9cff"),
    dimensionActive: dark ? "#ffffff" : "#111111",
  };
}

/** Applies Studio's theme and colours (MCP Apps' standard variables) to the page. */
function applyContext(context: HostContext) {
  const root = document.documentElement;
  root.dataset.theme = context.theme ?? "dark";
  for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
    root.style.setProperty(name, value);
  }
}

function ParameterRow(props: {
  readonly parameter: DesignParameter;
  readonly label: string;
  readonly onChange: (name: string, expression: string) => Promise<void>;
}) {
  const { parameter } = props;
  const value = formatValue(parameter.value, parameter.unit);
  const formula = restatesValue(parameter) ? null : parameter.expression;
  return (
    <li className="row parameter">
      <span className="row-name">{props.label}</span>
      {formula === null ? null : <span className="row-formula">{formula}</span>}
      <EditableValue
        label={props.label}
        expression={parameter.expression}
        display={value}
        onCommit={(expression) => props.onChange(parameter.name, expression)}
      />
      {parameter.error === null ? null : <span className="row-error">{parameter.error}</span>}
    </li>
  );
}

function FeatureRow(props: {
  readonly feature: TimelineFeature;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onRename: (name: string) => Promise<void>;
  readonly onSuppress: () => void;
  readonly onRollTo: () => void;
  readonly onChange: (name: string, expression: string) => Promise<void>;
}) {
  const { feature } = props;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(feature.name);
  const off = feature.suppressed || feature.rolled_back;
  return (
    <li className={`feature ${props.selected ? "selected" : ""} ${off ? "off" : ""}`}>
      <div className="feature-line">
        <button
          type="button"
          className="feature-main"
          aria-pressed={props.selected}
          onClick={props.onSelect}
          onDoubleClick={() => {
            setDraft(feature.name);
            setRenaming(true);
          }}
          data-tip={`${feature.kind}. Double-click to rename`}
        >
          <span className="feature-icon">{featureIcon(feature.kind)}</span>
          {renaming ? null : <span className="feature-name">{feature.name}</span>}
          {feature.error !== null ? <span className="dot error" aria-label="Failed" /> : null}
          {feature.error === null && feature.warning !== null ? (
            <span className="dot warning" aria-label="Warning" />
          ) : null}
        </button>
        {renaming ? (
          <input
            className="rename"
            autoFocus
            value={draft}
            aria-label={`New name for ${feature.name}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setRenaming(false);
              if (event.key === "Enter" && draft.trim() !== "" && draft !== feature.name) {
                void props.onRename(draft.trim()).finally(() => setRenaming(false));
              }
            }}
          />
        ) : null}
        <span className="feature-actions">
          <button
            type="button"
            className="icon"
            data-tip="Roll the timeline back to after this feature"
            aria-label={`Roll back to after ${feature.name}`}
            onClick={props.onRollTo}
          >
            <CornerDownLeft size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon"
            data-tip={feature.suppressed ? "Unsuppress" : "Suppress"}
            aria-label={`${feature.suppressed ? "Unsuppress" : "Suppress"} ${feature.name}`}
            aria-pressed={feature.suppressed}
            onClick={props.onSuppress}
          >
            {feature.suppressed ? (
              <EyeOff size={13} aria-hidden="true" />
            ) : (
              <Eye size={13} aria-hidden="true" />
            )}
          </button>
        </span>
      </div>
      {feature.error === null ? null : <p className="feature-error">{feature.error}</p>}
      {props.selected && feature.inputs.length > 0 ? (
        <ul className="inputs">
          {feature.inputs.map((input) => (
            <ParameterRow
              key={input.name}
              parameter={input}
              label={input.input ?? input.name}
              onChange={props.onChange}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The dimensions as chips over the model, following the camera. A dimension driven by one named
 * size (`width`) changes that size, so everything else it drives follows; any other dimension
 * takes the new value or formula itself.
 */
function DimensionChips(props: {
  readonly viewport: PartViewport;
  readonly dimensions: ReadonlyArray<ModelDimension>;
  readonly named: ReadonlySet<string>;
  readonly onActive: (param: string | null) => void;
  readonly onChange: (name: string, expression: string) => Promise<void>;
}) {
  const [, setFrame] = useState(0);
  useEffect(
    () => props.viewport.subscribe(() => setFrame(props.viewport.version)),
    [props.viewport],
  );
  return (
    <div className="chips">
      {props.dimensions.map((dimension) => {
        const at = props.viewport.project(dimension.anchor);
        if (!at.visible) return null;
        const driver = props.named.has(dimension.expression.trim())
          ? dimension.expression.trim()
          : null;
        return (
          <div
            key={`${dimension.sketch}:${dimension.param}`}
            className="chip"
            style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)` }}
          >
            <EditableValue
              label={driver ?? `${dimension.sketch} ${dimension.param}`}
              expression={
                driver === null ? dimension.expression : dimension.label.replace(/^[ØR]/, "")
              }
              display={dimension.label}
              hint={driver === null ? "Double-click to change" : `Double-click to change ${driver}`}
              onActive={(active) => props.onActive(active ? dimension.param : null)}
              onCommit={(expression) => props.onChange(driver ?? dimension.param, expression)}
            />
          </div>
        );
      })}
    </div>
  );
}

export function App(props: { readonly bridge: Bridge; readonly context: HostContext }) {
  const { bridge } = props;
  const [state, setState] = useState<DesignState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showDimensions, setShowDimensions] = useState(true);
  const [activeDimension, setActiveDimension] = useState<string | null>(null);
  const [viewport, setViewport] = useState<PartViewport | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const revision = useRef<number | string | undefined>(undefined);
  const opening = useRef<string | null>(null);

  const refresh = useCallback(
    async (force = false) => {
      try {
        const reply = await bridge.call<StateReply>("editor_state", {
          ...(force ? { force: true } : { revision: revision.current }),
          ...(opening.current === null ? {} : { open: opening.current }),
        });
        opening.current = null;
        if (reply.unchanged) return;
        revision.current = reply.revision;
        setState(reply);
        setProblem(null);
      } catch (cause) {
        setProblem(describeError(cause));
      }
    },
    [bridge],
  );

  // The design the tab was opened on, then the design as it changes.
  useEffect(() => {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      void refresh(true);
    };
    const off = bridge.onOpened((result) => {
      const opened = result.structuredContent as { path?: string | null } | undefined;
      if (typeof opened?.path === "string") opening.current = opened.path;
      start();
    });
    const fallback = window.setTimeout(start, 400);
    const timer = window.setInterval(() => {
      if (started && document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      off();
      window.clearTimeout(fallback);
      window.clearInterval(timer);
    };
  }, [bridge, refresh]);

  useEffect(() => {
    if (host.current === null) return;
    const created = new PartViewport(host.current, readColors());
    setViewport(created);
    const off = bridge.onContext((context) => {
      applyContext(context);
      created.setColors(readColors());
    });
    return () => {
      off();
      created.dispose();
    };
  }, [bridge]);

  useEffect(() => {
    viewport?.setMesh(state?.mesh ?? null);
  }, [viewport, state?.mesh]);

  const panels = useMemo(
    () => (state === null ? null : designPanels(state.parameters, state.timeline)),
    [state],
  );
  const named = useMemo(
    () => new Set((panels?.named ?? []).map((parameter) => parameter.name)),
    [panels],
  );
  const selectedSketch = useMemo(
    () => state?.sketches.find((sketch) => sketch.name === selected) ?? null,
    [state, selected],
  );
  const dimensions = useMemo(() => {
    if (state === null || !showDimensions) return [];
    const sketches = selectedSketch === null ? state.sketches : [selectedSketch];
    return sketches.flatMap((sketch) => sketchDimensions(sketch));
  }, [state, showDimensions, selectedSketch]);

  useEffect(() => {
    viewport?.setDimensions(
      dimensions.map((dimension) => ({ key: dimension.param, lines: dimension.lines })),
      activeDimension,
    );
  }, [viewport, dimensions, activeDimension]);

  // Each design is framed once, with its dimensions, when it first shows; then the camera is the engineer's.
  const framed = useRef<string | null>(null);
  useEffect(() => {
    const key = state === null ? null : (state.path ?? state.name);
    if (viewport === null || key === null || state?.mesh == null || framed.current === key) return;
    framed.current = key;
    viewport.fit();
  }, [viewport, state]);

  const edit = useCallback(
    (name: string, args: Record<string, unknown>) => {
      setSaving(true);
      return bridge
        .call<EditReply>(name, args)
        .then((reply) => {
          if (reply.ok === false) {
            const detail = (reply.errors ?? []).map((error) =>
              typeof error === "string" ? error : JSON.stringify(error),
            );
            throw new Error(detail.join("; ") || "SolidCraft refused the change");
          }
        })
        .finally(async () => {
          await refresh(true);
          setSaving(false);
        });
    },
    [bridge, refresh],
  );
  const change = useCallback(
    (name: string, expression: string) => edit("editor_change", { name, expression }),
    [edit],
  );

  const build = state === null ? null : buildSummary(state.timeline);
  const status = saving
    ? "Rebuilding"
    : state === null
      ? "Opening"
      : build?.tone !== "ok"
        ? build!.text
        : state.path === null
          ? "Not saved to a file"
          : state.dirty
            ? "Unsaved"
            : "Saved";
  const empty = state !== null && state.timeline.length === 0;

  return (
    <div className="editor">
      <header className="bar">
        <div className="title">
          <span className="name">{state === null ? "Part editor" : humanName(state.name)}</span>
          <span className="meta">
            Part · {state?.units ?? "mm"} ·{" "}
            <span className={`status ${build?.tone ?? "ok"}`}>{status}</span>
          </span>
        </div>
        <div className="tools">
          <button
            type="button"
            className="icon"
            data-tip="Undo"
            aria-label="Undo"
            disabled={state === null || saving}
            onClick={() => void edit("editor_undo", {})}
          >
            <Undo2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon"
            data-tip="Redo"
            aria-label="Redo"
            disabled={state === null || saving}
            onClick={() => void edit("editor_redo", {})}
          >
            <Redo2 size={15} aria-hidden="true" />
          </button>
          <span className="divider" />
          <button
            type="button"
            className="icon"
            data-tip={showDimensions ? "Hide dimensions" : "Show dimensions"}
            aria-label={showDimensions ? "Hide dimensions" : "Show dimensions"}
            aria-pressed={showDimensions}
            onClick={() => setShowDimensions((value) => !value)}
          >
            <Ruler size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon"
            data-tip="Fit the model"
            aria-label="Fit the model"
            onClick={() => viewport?.fit()}
          >
            <Scan size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="body">
        <div className="view" ref={host}>
          {viewport === null ? null : (
            <DimensionChips
              viewport={viewport}
              dimensions={dimensions}
              named={named}
              onActive={setActiveDimension}
              onChange={change}
            />
          )}
          {empty ? (
            <p className="empty">
              No part yet. Ask the agent for one in the chat, or open a SolidCraft design from the
              project's Files.
            </p>
          ) : null}
          {problem === null ? null : <p className="problem">{problem}</p>}
        </div>

        <aside className="side">
          <section aria-label="Parameters">
            <h2>Parameters</h2>
            {panels === null || panels.named.length === 0 ? (
              <p className="hint">
                {panels === null
                  ? "Reading the design"
                  : "No named sizes yet. Ask the agent to make the sizes that matter parameters."}
              </p>
            ) : (
              <ul className="rows">
                {panels.named.map((parameter) => (
                  <ParameterRow
                    key={parameter.name}
                    parameter={parameter}
                    label={parameter.name}
                    onChange={change}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Timeline">
            <h2>
              Timeline
              {state !== null && state.marker < state.timeline.length ? (
                <button
                  type="button"
                  className="link"
                  onClick={() => void edit("editor_timeline", { action: "roll_to" })}
                >
                  Roll to the end
                </button>
              ) : null}
            </h2>
            {panels === null ? null : (
              <ul className="features">
                {panels.features.map((feature) => (
                  <FeatureRow
                    key={feature.id}
                    feature={feature}
                    selected={selected === feature.name}
                    onSelect={() =>
                      setSelected((current) => (current === feature.name ? null : feature.name))
                    }
                    onRename={async (name) => {
                      await edit("editor_timeline", {
                        action: "rename",
                        feature: feature.name,
                        name,
                      });
                      if (selected === feature.name) setSelected(name);
                    }}
                    onSuppress={() =>
                      void edit("editor_timeline", {
                        action: "suppress",
                        feature: feature.name,
                        suppressed: !feature.suppressed,
                      })
                    }
                    onRollTo={() =>
                      void edit("editor_timeline", { action: "roll_to", feature: feature.name })
                    }
                    onChange={change}
                  />
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
