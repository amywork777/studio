import { createFileRoute } from "@tanstack/react-router";

import { CanvasPage } from "../components/workbench/canvas/CanvasPage";

/** Studio's canvas: a board to explore design options on (`components/workbench/canvas`). */
export const Route = createFileRoute("/_chat/canvas")({
  component: CanvasPage,
});
