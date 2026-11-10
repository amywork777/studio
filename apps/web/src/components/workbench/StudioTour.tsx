import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../ui/button";
import { MODULE_HEADING } from "./studioLayout";
import { cardPlace, tourDone, tourSteps, useTourStore } from "./tourSteps";

interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Studio's tour of a workspace (`tourSteps.ts`): the first time one opens, a card points at the
 * project, its Overview, the tabs and the toolbar in turn, the rest of the window dimmed. Skip or
 * Escape ends it; it is not shown again on this computer, and Take the tour in ⌘K brings it back.
 * A step whose place is not on screen (the sidebar folded) shows its card in the middle. It waits
 * for a quiet chat (`chatBusy`), so it never sits over a question or a reply being written.
 */
export function StudioTour(props: {
  /** The agent is working, or a question waits for the person. */
  readonly chatBusy: boolean;
}) {
  const { chatBusy } = props;
  const open = useTourStore((store) => store.open);
  const step = useTourStore((store) => store.step);
  const startFirst = useTourStore((store) => store.startFirst);
  const hold = useTourStore((store) => store.hold);
  const next = useTourStore((store) => store.next);
  const finish = useTourStore((store) => store.finish);
  const card = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{
    readonly step: number;
    readonly box: Box | null;
    readonly top: number;
    readonly left: number;
  } | null>(null);
  const steps = useMemo(() => tourSteps(navigator.platform), []);
  const current = steps[step] ?? null;

  // The first workspace opened: the tour starts once it has settled and the chat is quiet.
  useEffect(() => {
    if (chatBusy) {
      hold();
      return;
    }
    if (tourDone() || useTourStore.getState().open) return;
    const timer = setTimeout(startFirst, 900);
    return () => clearTimeout(timer);
  }, [chatBusy, hold, startFirst]);

  useEffect(() => {
    if (!open || current === null) return;
    const measure = () => {
      const rect = document.querySelector(current.target)?.getBoundingClientRect();
      const box =
        rect === undefined || rect.width === 0 || rect.height === 0
          ? null
          : { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      const size = card.current?.getBoundingClientRect();
      setPlaced({
        step,
        box,
        ...cardPlace(
          box,
          { width: size?.width ?? 320, height: size?.height ?? 180 },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      });
    };
    const frame = requestAnimationFrame(measure);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", escape);
    };
  }, [current, finish, open, step]);

  if (!open || current === null) return null;
  const last = step === steps.length - 1;
  const here = placed !== null && placed.step === step ? placed : null;

  return createPortal(
    <>
      {here?.box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-lg"
          style={{
            top: here.box.top - 4,
            left: here.box.left - 4,
            width: here.box.width + 8,
            height: here.box.height + 8,
            boxShadow:
              "0 0 0 2px var(--ring), 0 0 0 9999px color-mix(in oklab, black 40%, transparent)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/40" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-label="Studio tour"
        className="fixed z-50 flex w-80 flex-col gap-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        style={{ top: here?.top ?? -9999, left: here?.left ?? -9999 }}
      >
        <span className={MODULE_HEADING}>
          {step + 1} of {steps.length}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{current.title}</h2>
        <p className="text-sm text-muted-foreground">{current.body}</p>
        <div className="mt-1 flex items-center justify-end gap-2">
          {last ? null : (
            <Button size="sm" variant="ghost" onClick={finish}>
              Skip
            </Button>
          )}
          <Button size="sm" autoFocus onClick={last ? finish : next}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
