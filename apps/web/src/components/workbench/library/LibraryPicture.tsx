import type { EnvironmentId } from "@t3tools/contracts";
import { type LucideIcon, PuzzleIcon } from "lucide-react";
import { createElement, type ReactNode, useState } from "react";

import { cn } from "~/lib/utils";
import { fileTint, KIND_ICONS, KIND_TINT, MENU_TINTS, templateIcon } from "../kinds";
import { DOCUMENT_TEMPLATES, NEW_TEMPLATES } from "../newTemplates";
import { Page } from "../OverviewModules";
import type { LibraryDocument, LibraryEntry } from "./libraryCatalog";
import { COVER_SHEET, COVER_VIEW, coverOf, type LibraryCover } from "./libraryPictures";
import { documentGroup, skillGroup } from "./librarySearch";

/**
 * The box every picture fills, an example's (`ExamplePicture`) too: their own shape, 16:10, on the
 * viewer's ground, which an example's picture, drawn on nothing, shows through.
 */
export const PICTURE_BOX =
  "relative flex aspect-[8/5] flex-col items-center justify-center gap-2 overflow-hidden bg-(--model-ground)";

/**
 * A rendered picture over its kind's neutral glyph, which holds the box until the picture has
 * loaded (these load as they near the screen) and for good if it cannot, so a box is never empty.
 */
export function PictureOrGlyph(props: { readonly url: string; readonly icon: LucideIcon }) {
  const [state, setState] = useState<"waiting" | "shown" | "failed">("waiting");
  const Icon = props.icon;
  return (
    <>
      {state === "shown" ? null : (
        <Icon aria-hidden="true" className={cn("size-8 opacity-60", KIND_TINT)} />
      )}
      {state === "failed" ? null : (
        <img
          src={props.url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("shown")}
          onError={() => setState("failed")}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </>
  );
}

/** A file's folder and its name in it. */
const folderAndName = (file: string) => {
  const cut = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  return { root: file.slice(0, Math.max(cut, 0)), path: file.slice(cut + 1) };
};

/** A document type's icon, as New shows its first template, or a document's. */
function documentIcon(entry: LibraryDocument) {
  const template = [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES].find(
    (candidate) => candidate.id === entry.templates[0],
  );
  return template === undefined ? KIND_ICONS.Documents : templateIcon(template);
}

/** How many of a document's lines its sheet draws, and how long a line runs the sheet's width. */
const SHEET_LINES = 12;
const FULL_LINE = 64;
const SHEET_PAD = 22;
const SHEET_ROW = (COVER_SHEET.h - 2 * SHEET_PAD) / SHEET_LINES;

/** Marks over a picture: the same space, so a crop to the Toolbox's square cuts both alike. */
function CoverCanvas(props: { readonly children: ReactNode }) {
  return (
    <svg
      viewBox={COVER_VIEW}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className="absolute inset-0 size-full"
    >
      {props.children}
    </svg>
  );
}

/** The one sheet every document stands on, in both themes. */
function SheetShape() {
  return (
    <rect
      x={COVER_SHEET.x}
      y={COVER_SHEET.y}
      width={COVER_SHEET.w}
      height={COVER_SHEET.h}
      rx={COVER_SHEET.r}
      strokeWidth={2}
      className="fill-background stroke-border"
    />
  );
}

/**
 * The person's own template on the one sheet: each of its opening lines a bar as long as the line, a
 * heading's stronger. No words, so a page never reads as a second title beside the tile's name, and
 * nothing is cut off mid-sentence.
 */
export function DocumentSheet(props: { readonly text: string }) {
  const lines = props.text
    .split("\n")
    .map((line) => line.replace(/<[^>]*>/g, "").trim())
    .filter((line) => line !== "")
    .slice(0, SHEET_LINES);
  const room = COVER_SHEET.w - 2 * SHEET_PAD;
  return (
    <CoverCanvas>
      <SheetShape />
      {lines.map((line, row) => {
        const y = COVER_SHEET.y + SHEET_PAD + row * SHEET_ROW;
        return (
          <rect
            key={y}
            x={COVER_SHEET.x + SHEET_PAD}
            y={y}
            width={Math.max(10, Math.min(1, line.length / FULL_LINE) * room)}
            height={8}
            rx={4}
            className={line.startsWith("#") ? "fill-foreground/55" : "fill-foreground/25"}
          />
        );
      })}
    </CoverCanvas>
  );
}

/** The tones a cover's marks come in, each a theme token; `hue` is the entry's shelf's. */
const MARK_TONES: Readonly<Record<string, string>> = {
  ink: "text-foreground",
  warning: "text-warning",
  fail: "text-destructive",
  pass: "text-success",
  ground: "text-(--model-ground)",
};

/** The hue of the shelf an entry stands on (`LibraryPage`). */
function shelfTint(entry: LibraryEntry) {
  const group = entry.kind === "skill" ? skillGroup(entry.name) : documentGroup(entry);
  return group === "New" ? fileTint("CAD") : MENU_TINTS[group];
}

/** A cover's sheet, the other covers' pictures on it, and its marks. */
function CoverMarks(props: { readonly cover: LibraryCover; readonly hue: string }) {
  const { cover } = props;
  return (
    <CoverCanvas>
      {cover.sheet ? <SheetShape /> : null}
      {cover.insets.map((inset) => (
        <image
          key={inset.url}
          href={inset.url}
          x={inset.x}
          y={inset.y}
          width={inset.w}
          height={inset.h}
          preserveAspectRatio="xMidYMid slice"
        />
      ))}
      {cover.marks.map((mark) => (
        <path
          key={`${mark.tone} ${mark.d}`}
          d={mark.d}
          className={mark.tone === "hue" ? props.hue : MARK_TONES[mark.tone]}
          fill={mark.width === undefined ? "currentColor" : "none"}
          fillRule="evenodd"
          fillOpacity={mark.opacity}
          stroke={mark.width === undefined ? "none" : "currentColor"}
          strokeWidth={mark.width}
          strokeOpacity={mark.opacity}
          strokeDasharray={mark.dash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </CoverCanvas>
  );
}

/**
 * An entry's cover (`coverOf`): its picture and marks, or its sheet. One of the person's own
 * templates is its own first page, with the Documents icon until the file is read, and for good if
 * it can't be read as text. Another plugin's skill shows the puzzle piece Settings marks plugins
 * with, and a document type with no cover its template's icon, as New shows it.
 */
export function LibraryPicture(props: {
  readonly entry: LibraryEntry;
  readonly environmentId: EnvironmentId;
  readonly className?: string;
}) {
  const { entry } = props;
  const cover = coverOf(entry.id);
  const box = cn(PICTURE_BOX, props.className);
  const Icon = entry.kind === "skill" ? PuzzleIcon : documentIcon(entry);
  if (cover !== null) {
    return (
      <span className={box}>
        {/* The library mounts some forty of these: each loads when it nears the screen. */}
        {cover.url === null ? null : <PictureOrGlyph url={cover.url} icon={Icon} />}
        <CoverMarks cover={cover} hue={shelfTint(entry)} />
      </span>
    );
  }
  const own = entry.kind === "document" ? entry.ownTemplate?.file : undefined;
  if (own !== undefined) {
    const DocumentsIcon = KIND_ICONS.Documents;
    return (
      <span className={box}>
        <DocumentsIcon aria-hidden="true" className={cn("size-8 opacity-60", KIND_TINT)} />
        {/* The page covers the icon once the template is read. */}
        <span className="absolute inset-0 flex items-center justify-center bg-(--model-ground)">
          <Page environmentId={props.environmentId} {...folderAndName(own)} view={DocumentSheet} />
        </span>
      </span>
    );
  }
  return (
    <span className={box}>
      {createElement(Icon, { "aria-hidden": true, className: cn("size-8 opacity-60", KIND_TINT) })}
    </span>
  );
}
