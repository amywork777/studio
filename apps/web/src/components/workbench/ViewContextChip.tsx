import { BoxIcon } from "lucide-react";
import { useState } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { CHAT_PILL, CHAT_PILL_BUTTON } from "./chatPill";
import { useViewerSelectStore } from "./references/viewerSelect";
import { pickWords, viewContextOf } from "./viewMessage";

/**
 * What the model view sent with a message: one pill naming the parts picked and the count, the count
 * never cut. Its tooltip lists the picks; a press selects them again in the model beside the chat
 * (`studio/select`) and says how many the model no longer has.
 */
export function ViewContextChip(props: {
  readonly about: string;
  /** The chat the message is in, whose views are asked; null where none can be. */
  readonly threadKey: string | null;
}) {
  const context = viewContextOf(props.about);
  const [nonce, setNonce] = useState<number | null>(null);
  const answer = useViewerSelectStore((state) =>
    nonce === null ? undefined : state.answers[nonce],
  );
  const { threadKey } = props;
  const canSelect = threadKey !== null && context.picks.length > 0;
  const names = context.parts.join(", ");
  const body = (
    <>
      <BoxIcon aria-hidden="true" />
      {context.count === "" ? (
        <span className="min-w-0 truncate">Model view</span>
      ) : (
        <>
          {names === "" ? null : <span className="min-w-0 truncate">{names}</span>}
          {names === "" ? null : <span aria-hidden="true">·</span>}
          <span className="shrink-0 tabular-nums">{context.count}</span>
        </>
      )}
    </>
  );
  const lines = context.picks.length === 0 ? [props.about] : context.picks.map(pickWords);
  return (
    <span className="flex min-w-0 max-w-full items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            canSelect ? (
              <button
                type="button"
                data-view-context=""
                aria-label={`${names === "" ? "" : `${names}, `}${context.count}: select them in the model`}
                className={CHAT_PILL_BUTTON}
                onClick={() =>
                  setNonce(useViewerSelectStore.getState().select(threadKey, context.picks))
                }
              />
            ) : (
              <span data-view-context="" className={CHAT_PILL} />
            )
          }
        >
          {body}
        </TooltipTrigger>
        <TooltipPopup side="top">
          <ul className="flex max-w-80 flex-col gap-0.5">
            {lines.map((line, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- two picks may read the same
              <li key={`${index}:${line}`} className="truncate">
                {line}
              </li>
            ))}
          </ul>
          {canSelect ? (
            <p className="pt-1 text-muted-foreground">Select them in the model</p>
          ) : null}
        </TooltipPopup>
      </Tooltip>
      {answer === undefined || answer.missing === 0 ? null : (
        <span className="text-xs text-muted-foreground">
          {answer.missing === 1
            ? "1 pick no longer in the model"
            : `${answer.missing} picks no longer in the model`}
        </span>
      )}
    </span>
  );
}
