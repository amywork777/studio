/**
 * Studio: a running turn's steps under its "Working for" line, in an engineer's words
 * ("Reading the script → Rebuilding the head"), the latest last; cut at the start where it runs
 * out of room, so the step being taken always shows.
 */
export function TurnStepLine(props: { readonly steps: string }) {
  return (
    <p
      className="min-w-0 truncate px-1 text-xs leading-5 text-muted-foreground [direction:rtl] [text-align:left]"
      data-turn-steps=""
    >
      <bdi className="[direction:ltr]">{props.steps}</bdi>
    </p>
  );
}
