import {
  Axis3dIcon,
  BookOpenIcon,
  BoxIcon,
  BoxesIcon,
  CircuitBoardIcon,
  DrillIcon,
  FactoryIcon,
  FilePlusIcon,
  FileTextIcon,
  FoldVerticalIcon,
  GaugeIcon,
  ImageIcon,
  MessageSquareIcon,
  PackageIcon,
  PencilRulerIcon,
  ScissorsIcon,
  SlidersHorizontalIcon,
  SpoolIcon,
  type LucideIcon,
} from "lucide-react";

import type { HardwareActionGroup } from "./hardwareActions";
import type { Discipline, NewTemplate } from "./newTemplates";
import type { ProjectGroup } from "./projectFiles";

/**
 * One icon per kind of thing a project holds, the same everywhere Studio shows it. FEA and CAM are
 * work done on a design, not kinds of design, so what the top bar's menus make carries the menu's
 * icon and shows on the part it was made from.
 */
export const KIND_ICONS: Readonly<Record<ProjectGroup, LucideIcon>> = {
  CAD: BoxIcon,
  Electronics: CircuitBoardIcon,
  Documents: FileTextIcon,
  Drawings: PencilRulerIcon,
  Analysis: GaugeIcon,
  Manufacturing: FactoryIcon,
  Images: ImageIcon,
  "Reference parts": PackageIcon,
  References: BookOpenIcon,
};

/** New's disciplines, by the kind of thing each makes. */
export const DISCIPLINE_ICONS: Readonly<Record<Discipline, LucideIcon>> = {
  CAD: KIND_ICONS.CAD,
  Electronics: KIND_ICONS.Electronics,
  Analysis: KIND_ICONS.Analysis,
  Manufacturing: KIND_ICONS.Manufacturing,
  // The robot face is the AI agent's (Settings, the chat); Robotics is the joints of a mechanism.
  Robotics: Axis3dIcon,
  Documents: KIND_ICONS.Documents,
};

/**
 * The New templates with a picture of their own, by id, so the ones a discipline offers read apart.
 * A template that is a Toolbox job takes that job's picture (`toolIcons.ts`).
 */
const TEMPLATE_ICONS: Partial<Record<string, LucideIcon>> = {
  assembly: BoxesIcon,
  "sheet-metal": FoldVerticalIcon,
  drawing: KIND_ICONS.Drawings,
  "cam-job": DrillIcon,
  print: SpoolIcon,
  "cut-file": ScissorsIcon,
};

/** A New template's icon: a file of the person's, its own, or the kind of thing it makes. */
export function templateIcon(template: NewTemplate) {
  if (template.file !== undefined) return FilePlusIcon;
  return TEMPLATE_ICONS[template.id] ?? DISCIPLINE_ICONS[template.discipline];
}

/**
 * The menus in the one word Studio has for what their jobs make, the same as tabs, New, Find and
 * the file filters say it. Their keys and URLs keep the CAD verbs, and the ribbon's own Evaluate
 * tab stays, as SolidWorks names it.
 */
export const MENU_WORDS: Readonly<Record<HardwareActionGroup, ProjectGroup>> = {
  Evaluate: "Analysis",
  Manufacture: "Manufacturing",
  Document: "Documents",
};

/** The top bar's menus, by what their jobs make. */
export const MENU_ICONS: Readonly<Record<HardwareActionGroup, LucideIcon>> = {
  Evaluate: KIND_ICONS.Analysis,
  Manufacture: KIND_ICONS.Manufacturing,
  Document: KIND_ICONS.Documents,
};

/** The kind each kind of file (`partNames.ts`) is filed under. */
const FILE_KINDS: Readonly<Record<string, ProjectGroup>> = {
  Part: "CAD",
  Design: "CAD",
  Mesh: "CAD",
  Source: "CAD",
  Robot: "CAD",
  "Planning groups": "CAD",
  "Simulation model": "CAD",
  Board: "Electronics",
  Schematic: "Electronics",
  Harness: "Electronics",
  Drawing: "Drawings",
  "FEA study": "Analysis",
  Result: "Analysis",
  "CAM job": "Manufacturing",
  Toolpath: "Manufacturing",
  "G-code": "Manufacturing",
  Gerbers: "Manufacturing",
  "Bill of materials": "Manufacturing",
  "Pick and place": "Manufacturing",
  Document: "Documents",
  Table: "Documents",
  Image: "Images",
};

/** The icons a file can take: its kind's, or the project's setup. */
export const FILE_ICONS: Readonly<Record<ProjectGroup | "Setup", LucideIcon>> = {
  ...KIND_ICONS,
  Setup: SlidersHorizontalIcon,
};

/**
 * Which icon a file takes by what it is ("G-code", "Strength check", "Board"): its kind's, the
 * setup's, or, for anything else, a document's.
 */
export function fileIconKey(kind: string): ProjectGroup | "Setup" {
  if (kind === "Setup") return "Setup";
  if (kind.endsWith(" check")) return "Analysis";
  return FILE_KINDS[kind] ?? "Documents";
}

/** A project's chats, beside the kinds of file it holds (the Overview's list of everything). */
export const CHAT_ICON: LucideIcon = MessageSquareIcon;

/** The quiet grey of an icon that names no kind of thing. */
export const KIND_TINT = "text-muted-foreground";

/**
 * A kind's hue, the same wherever Studio shows that kind: files, tiles, the Toolbox, New and Find,
 * on the icon alone and never its words. Never red, amber or green, which say failed, warning and
 * passed. The hues are theme tokens (`brand/theme.css`).
 */
const FILE_TINTS: Partial<Record<ProjectGroup | "Setup", string>> = {
  CAD: "text-(--kind-cad)",
  Electronics: "text-(--kind-electronics)",
  Analysis: "text-(--kind-analysis)",
  Documents: "text-(--kind-document)",
  Drawings: "text-(--kind-document)",
  Manufacturing: "text-(--kind-manufacturing)",
};

export function fileTint(key: ProjectGroup | "Setup"): string {
  return FILE_TINTS[key] ?? KIND_TINT;
}

/** Each Toolbox tab's hue, the kind its jobs make (as `MENU_ICONS`). */
export const MENU_TINTS: Readonly<Record<HardwareActionGroup, string>> = {
  Evaluate: fileTint("Analysis"),
  Manufacture: fileTint("Manufacturing"),
  Document: fileTint("Documents"),
};

/** A New template's hue: its kind's, as the Overview and Find color that kind. */
export function templateTint(template: NewTemplate): string {
  if (template.file !== undefined || template.discipline === "Documents") {
    return fileTint("Documents");
  }
  if (template.id === "drawing") return fileTint("Drawings");
  return template.discipline === "Robotics" ? fileTint("CAD") : fileTint(template.discipline);
}
