import { useRef } from "react";

import { APP_VERSION } from "../../branding";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { InlineButton } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** The version this is: the desktop app's own where it says one (`version`), else the web app's. */
export function AboutVersionTitle(props: { readonly version?: string | undefined }) {
  const version = props.version || APP_VERSION;
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const { copyToClipboard } = useCopyToClipboard<void>({
    target: "version",
    onCopy: () => showAnchoredCopySuccessToast(copyButtonRef),
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not copy version",
          description: error.message,
        }),
      );
    },
  });

  return (
    <span className="inline-flex items-baseline gap-2">
      <span>Version</span>
      <span className="text-2xs font-medium tabular-nums">
        <Tooltip>
          <TooltipTrigger
            render={
              <InlineButton
                ref={copyButtonRef}
                tone="muted"
                aria-label={`Copy version ${version}`}
                onClick={() => copyToClipboard(version, undefined)}
              >
                {version}
              </InlineButton>
            }
          />
          <TooltipPopup>Copy version</TooltipPopup>
        </Tooltip>
      </span>
    </span>
  );
}
