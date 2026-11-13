import { Button } from "../ui/button";
import {
  RICH_TOOLTIP_DELAY,
  Tooltip,
  TooltipPopup,
  TooltipRich,
  TooltipTrigger,
} from "../ui/tooltip";
import { KIND_ICONS } from "./kinds";

/**
 * The one button that hides or shows a part's CAD tools; a selection on the model goes to the agent
 * either way. Held, with the reason, while a command or sketch is open in the view in front. The
 * choice lives in Simple view's store (`simpleView.ts`).
 */
export function CadToolsButton(props: {
  readonly shown: boolean;
  readonly held: boolean;
  readonly onChange: (shown: boolean) => void;
}) {
  const label = props.shown ? "Hide CAD tools" : "Show CAD tools";
  const description = props.shown
    ? "Put away the toolbar, the design tree and the feature boxes. Click the model and ask the agent instead."
    : "Sketch, extrude and edit features yourself, with the tree and the toolbar, like NX or SolidWorks.";
  return (
    <Tooltip>
      {/* Hovered through a span: a held button takes no pointer of its own, and says why. */}
      <TooltipTrigger delay={RICH_TOOLTIP_DELAY} render={<span className="flex" />}>
        <Button
          variant="outline"
          size="sm"
          aria-label={label}
          aria-pressed={props.shown}
          disabled={props.held}
          data-studio-cad-tools=""
          onClick={() => props.onChange(!props.shown)}
        >
          <KIND_ICONS.CAD aria-hidden="true" />
          <span className="@max-[40rem]/toolbar:hidden">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        <TooltipRich
          title={label}
          description={description}
          {...(props.held ? { note: "Finish or cancel the command first" } : {})}
        />
      </TooltipPopup>
    </Tooltip>
  );
}
