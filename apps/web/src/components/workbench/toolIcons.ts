import {
  AnvilIcon,
  Axis3dIcon,
  BoxIcon,
  CameraIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DrillIcon,
  DropletIcon,
  DumbbellIcon,
  ExpandIcon,
  FileBoxIcon,
  FileStackIcon,
  FlaskConicalIcon,
  FoldVerticalIcon,
  LayersIcon,
  ListOrderedIcon,
  NotebookPenIcon,
  PencilRulerIcon,
  PlayIcon,
  Rotate3dIcon,
  RouteIcon,
  RulerIcon,
  ScanLineIcon,
  ScissorsIcon,
  ShoppingCartIcon,
  SpoolIcon,
  SyringeIcon,
  TargetIcon,
  TruckIcon,
  WeightIcon,
  type LucideIcon,
} from "lucide-react";

import type { HardwareAction } from "./hardwareActions";
import { DISCIPLINE_ICONS, KIND_ICONS, MENU_ICONS } from "./kinds";

/**
 * Each job's own picture on its Toolbox tile, by job id (`HARDWARE_ACTIONS`), so the tiles in a
 * section read as different tools. A job's picture says the one thing it is about (a weight for
 * mass, a spool for FDM, a folded sheet for a sheet metal check and scissors for its cut file);
 * the same idea keeps the same picture across sections (a timer for anything "over
 * time", a truck for an order, a route for a toolpath). The robot face is the AI agent's, so the
 * robot descriptions take Robotics' joints.
 */
const JOB_ICONS: Partial<Record<string, LucideIcon>> = {
  // Evaluate: Simulation
  strength: DumbbellIcon,
  // Fit, motion and mass
  fit: RulerIcon,
  motion: Rotate3dIcon,
  mass: WeightIcon,
  // Manufacture: printing, one picture per way of printing
  fdm: SpoolIcon,
  slice: LayersIcon,
  resin: DropletIcon,
  powder: ScanLineIcon,
  "metal-print": AnvilIcon,
  // CNC machining
  cnc: DrillIcon,
  toolpaths: RouteIcon,
  // Sheet metal
  "sheet-metal": FoldVerticalIcon,
  // Laser and waterjet cutting
  dxf: ScissorsIcon,
  sendcutsend: TruckIcon,
  // Injection molding
  molding: SyringeIcon,
  // Files and off-the-shelf parts
  "standard-parts": ShoppingCartIcon,
  export: FileBoxIcon,
  // Circuit board: its checks, then its files (a board's STEP is a box, the part's STEP a file)
  "board-check": KIND_ICONS.Electronics,
  "board-review": ClipboardCheckIcon,
  "board-fab": FileStackIcon,
  "board-step": BoxIcon,
  // Document
  drawing: KIND_ICONS.Drawings,
  // Datums and the tolerances located from them.
  pmi: TargetIcon,
  "parts-list": ClipboardListIcon,
  instructions: ListOrderedIcon,
  exploded: ExpandIcon,
  pictures: CameraIcon,
  "play-motion": PlayIcon,
  "test-plan": FlaskConicalIcon,
  "write-up": NotebookPenIcon,
  "robot-files": DISCIPLINE_ICONS.Robotics,
};

/** The jobs with a picture of their own, by id: the test holds each to a real job. */
export const JOB_ICON_IDS: ReadonlyArray<string> = Object.keys(JOB_ICONS);

/** A section's picture (`ACTION_SECTIONS`), for a job of it that has none of its own yet. */
const SECTION_ICONS: Partial<Record<string, LucideIcon>> = {
  simulation: DumbbellIcon,
  "fit-mass": RulerIcon,
  "board-checks": KIND_ICONS.Electronics,
  printing: SpoolIcon,
  machining: DrillIcon,
  sheet: FoldVerticalIcon,
  files: FileBoxIcon,
  "board-files": FileStackIcon,
  drawings: PencilRulerIcon,
  building: ListOrderedIcon,
  pictures: CameraIcon,
  reports: FlaskConicalIcon,
  robot: Axis3dIcon,
};

/**
 * A job's picture on its Toolbox tile: its own, else its section's, else its group's (the top
 * bar menu's icon).
 */
export function toolIcon(action: HardwareAction): LucideIcon {
  return JOB_ICONS[action.id] ?? SECTION_ICONS[action.section] ?? MENU_ICONS[action.group];
}

/** Whether a section (`ACTION_SECTIONS` id) has a picture of its own for its jobs to fall back on. */
export function hasSectionIcon(section: string): boolean {
  return SECTION_ICONS[section] !== undefined;
}
