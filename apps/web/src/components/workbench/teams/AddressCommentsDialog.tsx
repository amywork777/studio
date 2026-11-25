import type { StudioTeamReview, StudioTeamRole } from "@t3tools/contracts";
import { useState } from "react";

import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import { fromInside, openComments, type ReviewComment } from "./reviewPrompt";
import { ROLE_LABEL } from "./teamWords";

/**
 * Before the agent reads a review: each open comment quoted, and which to hand it. Comments from
 * outside reviewers start unticked, so nothing a customer wrote reaches the agent unread.
 */
export function AddressCommentsDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly review: StudioTeamReview;
  readonly roleOf: (email: string) => StudioTeamRole | undefined;
  readonly onHand: (chosen: ReadonlyArray<ReviewComment>) => void;
}) {
  const open = openComments(props.review);
  const [ticked, setTicked] = useState<ReadonlySet<string> | null>(null);
  const chosenIds =
    ticked ??
    new Set(open.filter((each) => fromInside(props.roleOf(each.by))).map((each) => each.id));
  const chosen = open.filter((each) => chosenIds.has(each.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosenIds);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) setTicked(null);
        props.onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hand comments to the agent</DialogTitle>
          <DialogDescription>
            The agent can change files and run commands on this computer. Read each comment and tick
            the ones it should address. It gets them as quotes, not as instructions.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <ul className="flex flex-col gap-3" aria-label="Comments">
            {open.map((each) => {
              const role = props.roleOf(each.by);
              return (
                <li key={each.id}>
                  <label className="flex min-w-0 items-start gap-2.5">
                    <Checkbox
                      className="mt-0.5"
                      checked={chosenIds.has(each.id)}
                      onCheckedChange={(checked) => toggle(each.id, checked === true)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{each.by}</span>
                        {role === undefined ? "Not on the team" : ROLE_LABEL[role]}
                        {fromInside(role) ? null : (
                          <Badge variant="secondary">Outside reviewer</Badge>
                        )}
                        {each.pin === null ? null : <span>on {each.pin.file}</span>}
                      </span>
                      <blockquote className="border-s-2 border-border ps-2.5 text-sm whitespace-pre-wrap text-foreground">
                        {each.body}
                      </blockquote>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => {
              props.onHand(chosen);
              setTicked(null);
            }}
          >
            {chosen.length === 1
              ? "Hand 1 comment to the agent"
              : `Hand ${chosen.length} comments to the agent`}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
