import type { StudioSample } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { FileInputIcon, type LucideIcon } from "lucide-react";
import { Children, type ComponentProps, type ReactNode, useState } from "react";

import { cn } from "~/lib/utils";
import { ExampleCard } from "./examples/ExampleCard";
import { NEEDS_DESKTOP_APP } from "./examples/examples";
import { readGetStartedFolded, writeGetStartedFolded } from "./homeStart";
import { ImportMenu } from "./ImportMenu";
import { fileTint, KIND_ICONS } from "./kinds";
import { HeadingLink, OverviewModule } from "./OverviewModules";
import { GROUP_LABEL, MODULE_HEADING, projectTileGrid, SECTION_STACK } from "./studioLayout";

/** How many examples the Get started strip shows: one full row; All examples has any past it. */
const STRIP_EXAMPLES = 5;

/** One of the start page's two ways in: a big card, its icon over what it does and a line more. */
function StartChoice({
  icon: Icon,
  tint,
  label,
  note,
  disabled,
  busy,
  onChoose,
  ...rest
}: Omit<ComponentProps<"button">, "onClick" | "children" | "className"> & {
  readonly icon: LucideIcon;
  readonly tint?: string;
  readonly label: string;
  readonly note: string;
  readonly disabled?: boolean;
  /** Under way: it shows it, and takes no press. */
  readonly busy?: boolean;
  /** Unset where the card opens a menu (`ImportMenu`), which brings its own press. */
  readonly onChoose?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-xs/5 outline-none transition-colors duration-150 enabled:hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64"
    >
      <Icon aria-hidden="true" className={cn("size-6", tint ?? "text-foreground/75")} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}

/**
 * The start page's two big buttons: New part (`useNewPart`, opens in CAD mode at once) and Import a
 * STEP (`ImportMenu`). `importActions` is null where there is no desktop app to read this
 * computer's files.
 */
export function StartChoices(props: {
  readonly onNewPart: () => void;
  /** New part is being made. */
  readonly newPartBusy: boolean;
  readonly importActions: ComponentProps<typeof ImportMenu>["actions"] | null;
}) {
  const importCard = (
    <StartChoice
      icon={FileInputIcon}
      label="Import a STEP"
      note={props.importActions === null ? NEEDS_DESKTOP_APP : "Or drop files here."}
      disabled={props.importActions === null}
    />
  );
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <StartChoice
        icon={KIND_ICONS.CAD}
        tint={fileTint("CAD")}
        label="New part"
        note={
          props.newPartBusy
            ? "Making the part…"
            : "Opens with the CAD tools, on a block to shape by its sizes."
        }
        busy={props.newPartBusy}
        onChoose={props.onNewPart}
      />
      {props.importActions === null ? (
        importCard
      ) : (
        <ImportMenu actions={props.importActions} trigger={importCard} />
      )}
    </div>
  );
}

/** A group of tiles under its label (Starred, Recent); with none it is the only group. */
export function TileGroup(props: { readonly label: string | null; readonly children: ReactNode }) {
  return (
    <div className={SECTION_STACK}>
      {props.label === null ? null : <h3 className={GROUP_LABEL}>{props.label}</h3>}
      <div className={projectTileGrid(Children.count(props.children))}>{props.children}</div>
    </div>
  );
}

/**
 * The examples as cards, each opening its page (`/library/examples/$id`), five across at the size
 * of project tiles, so the person's own work outweighs them.
 */
function ExampleTiles(props: { readonly examples: ReadonlyArray<StudioSample> }) {
  const navigate = useNavigate();
  return (
    <div className={projectTileGrid(5)}>
      {props.examples.map((sample) => (
        <ExampleCard
          key={sample.id}
          sample={sample}
          onOpen={() => void navigate({ to: "/library/examples/$id", params: { id: sample.id } })}
        />
      ))}
    </div>
  );
}

/** The start page's examples, under its two big buttons and the Start box: every one, to open and make a copy of. */
export function StartExamples(props: { readonly examples: ReadonlyArray<StudioSample> }) {
  if (props.examples.length === 0) return null;
  return (
    <section aria-label="Get started" className={SECTION_STACK}>
      <h2 className={MODULE_HEADING}>Get started</h2>
      <ExampleTiles examples={props.examples} />
    </section>
  );
}

/**
 * Home's Get started strip, under Starred and Recent once there are projects: a row of the
 * examples, and All examples opens the rest in place. It folds away as an Overview module does,
 * and the fold is kept on this device (`readGetStartedFolded`).
 */
export function GetStarted(props: { readonly examples: ReadonlyArray<StudioSample> }) {
  const [folded, setFolded] = useState(readGetStartedFolded);
  const [allShown, setAllShown] = useState(false);
  if (props.examples.length === 0) return null;
  return (
    <OverviewModule
      title="Get started"
      folded={folded}
      onFold={() => {
        setFolded(!folded);
        writeGetStartedFolded(!folded);
      }}
      action={
        props.examples.length <= STRIP_EXAMPLES ? undefined : (
          <HeadingLink
            label={allShown ? "Fewer examples" : "All examples"}
            onClick={() => setAllShown(!allShown)}
          />
        )
      }
    >
      <ExampleTiles
        examples={allShown ? props.examples : props.examples.slice(0, STRIP_EXAMPLES)}
      />
    </OverviewModule>
  );
}
