import {
  FULL_ACCESS_OVERRIDE_QUESTION,
  fullAccessOverrideExplanation,
} from "@t3tools/client-runtime/state/thread-requests";
import { ShieldIcon } from "lucide-react";
import { memo, use } from "react";
import { type PendingApproval } from "../../session-logic";
import { cn } from "~/lib/utils";
import { InlineButton } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { ToolActivityIconView, type WorkEntryIconName } from "./TimelineToolActivityIcon";
import { TimelineRowCtx } from "./timelineRowContext";
import { WorkLogRow } from "./WorkLog";
import { engineeringStepLabel } from "../workbench/engineeringLabels";
import { useEngineeringInterface } from "../workbench/studioInterface";

const APPROVAL_PRESENTATION = {
  command: { icon: "terminal", label: "Command approval", detailLabel: "Command" },
  "file-change": { icon: "square-pen", label: "File change approval", detailLabel: "File change" },
  "file-read": { icon: "eye", label: "File read approval", detailLabel: "File to read" },
  permission: {
    icon: "wrench",
    label: "App permission approval",
    detailLabel: "Permission request",
  },
  "mcp-elicitation": {
    icon: "hammer",
    label: "App access approval",
    detailLabel: "App access request",
  },
} satisfies Record<
  PendingApproval["requestKind"],
  { icon: WorkEntryIconName; label: string; detailLabel: string }
>;

// Studio says what the agent asks to do in its own words; the command stays out of the way.
const STUDIO_APPROVAL_LABEL = {
  command: "Asks to go ahead",
  "file-change": "Asks to change files",
  "file-read": "Asks to read a file",
  permission: "Asks for access",
  "mcp-elicitation": "Asks for access",
} satisfies Record<PendingApproval["requestKind"], string>;

export const TimelinePendingApprovalRow = memo(function TimelinePendingApprovalRow({
  approval,
}: {
  approval: PendingApproval;
}) {
  const { respondingRequestIds, canOperateThread, onRespondToApproval } = use(TimelineRowCtx);
  const presentation = APPROVAL_PRESENTATION[approval.requestKind];
  const canRespond = approval.responseCapability === "live";
  const studio = useEngineeringInterface();
  const label = studio ? STUDIO_APPROVAL_LABEL[approval.requestKind] : presentation.label;
  const detail =
    studio && approval.requestKind === "command" && approval.detail
      ? engineeringStepLabel(approval.detail).doing
      : approval.detail;
  const Detail = studio ? "span" : "code";
  return (
    <WorkLogRow
      role="group"
      aria-label={label}
      data-v2-item-type="approval_request"
      wrapLabel
      icon={
        <ToolActivityIconView
          icon={undefined}
          fallbackName={presentation.icon}
          className="block size-4 shrink-0 stroke-2 text-icon-muted"
          muted
        />
      }
      label={
        <Detail
          aria-label={presentation.detailLabel}
          className={cn(
            "block max-h-40 min-w-0 overflow-auto whitespace-pre-wrap text-xs leading-5 text-foreground select-text! wrap-anywhere [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
            studio ? "font-sans" : "font-mono",
          )}
          data-approval-detail="complete"
          tabIndex={0}
        >
          {detail || label}
        </Detail>
      }
    >
      <div className="ms-7.5 flex min-w-0 flex-col gap-1 pb-1 text-xs">
        {approval.appName ? (
          <span className="text-muted-foreground wrap-anywhere">{approval.appName}</span>
        ) : null}
        {approval.reason ? (
          <span className="text-muted-foreground select-text wrap-anywhere">{approval.reason}</span>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {canRespond ? (
            <>
              <span className="inline-flex items-center gap-1 text-warning">
                <ShieldIcon aria-hidden className="size-3 shrink-0" />
                Waiting for approval
              </span>
              {onRespondToApproval ? (
                <>
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                  <ComposerPendingApprovalActions
                    presentation="inline"
                    requestId={approval.requestId}
                    disabled={!canOperateThread}
                    isResponding={respondingRequestIds.includes(approval.requestId)}
                    canRespond={canRespond}
                    options={approval.options}
                    onRespondToApproval={onRespondToApproval}
                  />
                </>
              ) : null}
            </>
          ) : (
            <span className="text-warning">
              {studio
                ? "The AI agent has stopped. Stop this work and ask again to answer it."
                : "Provider process is gone. Interrupt or restart the run to respond."}
            </span>
          )}
          {approval.fullAccessOverride ? (
            <Popover>
              <PopoverTrigger openOnHover render={<InlineButton tone="muted" />}>
                {FULL_ACCESS_OVERRIDE_QUESTION}
              </PopoverTrigger>
              <PopoverPopup
                aria-label={FULL_ACCESS_OVERRIDE_QUESTION}
                tooltipStyle
                side="top"
                className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal"
              >
                {fullAccessOverrideExplanation(approval.fullAccessOverride)}
              </PopoverPopup>
            </Popover>
          ) : null}
        </div>
      </div>
    </WorkLogRow>
  );
});
