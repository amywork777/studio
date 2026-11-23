import { Badge } from "../ui/badge";
import { CheckBadge } from "./CheckBadge";
import { checkOutOfDate, type CheckResult } from "./checkResults";
import { fileTint, KIND_ICONS } from "./kinds";
import { lowerName } from "./partNames";
import type { ProjectFile, ProjectGroup } from "./projectFiles";

/** A part or board of a project folder, with how its checks went and what was made from it. */
export interface FolderPart {
  readonly root: string;
  readonly file: ProjectFile;
  readonly results: ReadonlyArray<CheckResult>;
  /** Its checks from before it last changed (`checkOutOfDate`), which pass or fail nothing. */
  readonly outdated: ReadonlyArray<CheckResult>;
  /** Its drawing sheets, relative to the folder. */
  readonly drawings: ReadonlyArray<string>;
  /** What was made to manufacture it: its CAM jobs, G-code, Gerbers (`manufacturingFor`). */
  readonly made: ReadonlyArray<ProjectFile>;
}

/** A part's stand-in until its picture comes: its kind's icon. */
export function PartIcon(props: { readonly file: ProjectFile; readonly className: string }) {
  const Icon = KIND_ICONS[props.file.group];
  return <Icon className={props.className} aria-hidden="true" />;
}

/**
 * What was made to manufacture a part, one of each kind (a CAM job, its G-code, Gerbers), each
 * opening the file that shows it: a toolpath's model before its data.
 */
function madeKinds(files: ReadonlyArray<ProjectFile>) {
  const shown = new Map<string, ProjectFile>();
  for (const file of files) {
    const kept = shown.get(file.kind);
    if (kept === undefined || (/\.glb$/i.test(file.path) && !/\.glb$/i.test(kept.path))) {
      shown.set(file.kind, file);
    }
  }
  return [...shown.values()];
}

/** One thing made from a part: a badge on a card, a control in its kind's hue under the lead part. */
/**
 * A link among the lead part's facts (a drawing, a print file, its sizes): the facts' own small
 * text with an icon, never a button standing taller than the words beside it.
 */
export const LEAD_LINK_CLASS =
  "inline-flex h-5 items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

function MadeLink(props: {
  readonly group: ProjectGroup;
  readonly name: string;
  readonly label: string;
  readonly lead: boolean;
  readonly onOpen: () => void;
}) {
  const Icon = KIND_ICONS[props.group];
  if (props.lead) {
    return (
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onOpen}
        className={LEAD_LINK_CLASS}
      >
        <Icon aria-hidden="true" className={`size-3.5 ${fileTint(props.group)}`} />
        {props.name}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={props.label}
      className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <Badge variant="outline">
        <Icon aria-hidden="true" />
        {props.name}
      </Badge>
    </button>
  );
}

/** What was made from a part, each opening it: its drawing sheets and manufacturing files. */
export function MadeBadges(props: {
  readonly part: FolderPart;
  readonly onOpen: (path: string) => void;
  /** Under the lead part, where they are the part's outputs, not a tag on a card. */
  readonly lead?: boolean;
}) {
  const { part, lead = false } = props;
  return (
    <>
      {part.drawings.map((drawing) => (
        <MadeLink
          key={drawing}
          group="Drawings"
          name="Drawing"
          label={`Open the drawing of ${part.file.title}`}
          lead={lead}
          onOpen={() => props.onOpen(drawing)}
        />
      ))}
      {madeKinds(part.made).map((made) => (
        <MadeLink
          key={made.path}
          group="Manufacturing"
          name={made.kind}
          label={`Open the ${lowerName(made.kind)} of ${part.file.title}`}
          lead={lead}
          onOpen={() => props.onOpen(made.path)}
        />
      ))}
    </>
  );
}

/**
 * Under a part's card or row: its checks as badges, then what was made from it, each opening what
 * it names, by its path in the part's folder. No badge means no check has run: the lead part says
 * so once (`LeadPart`), not every tile again.
 */
export function PartFooter(props: {
  readonly part: FolderPart;
  readonly onOpen: (path: string) => void;
}) {
  const { part } = props;
  const checks = [...part.results, ...part.outdated];
  if (checks.length + part.drawings.length + part.made.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {checks.map((result) => (
        <CheckBadge
          key={result.path}
          result={result}
          outOfDate={checkOutOfDate(result, part.file)}
          onOpen={() => props.onOpen(result.model)}
        />
      ))}
      <MadeBadges part={part} onOpen={props.onOpen} />
    </div>
  );
}
