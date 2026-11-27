import { StarIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { useToolboxPins } from "./toolboxPins";

/**
 * A tool's star, over the end of its row, named as Home's project stars are: stars it to the top of
 * its Toolbox tab or takes it out (`useToolboxPins`). Shown
 * on a pinned tool, and on another while the pointer or focus is on its row (`group/pin`). The
 * brand's hue, never amber: red, amber and green are for status alone.
 */
export function PinStar(props: { readonly jobId: string; readonly name: string }) {
  const pinned = useToolboxPins((state) => state.pins.includes(props.jobId));
  const toggle = useToolboxPins((state) => state.toggle);
  return (
    <button
      type="button"
      aria-label={pinned ? `Unstar ${props.name}` : `Star ${props.name}`}
      aria-pressed={pinned}
      onClick={() => toggle(props.jobId)}
      className={cn(
        "absolute end-1 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md outline-none transition-opacity duration-150 hover:bg-accent/50 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
        pinned
          ? "text-primary"
          : "text-muted-foreground opacity-0 group-hover/pin:opacity-100 group-focus-within/pin:opacity-100",
      )}
    >
      <StarIcon aria-hidden="true" className={cn("size-3.5", pinned && "fill-current")} />
    </button>
  );
}
