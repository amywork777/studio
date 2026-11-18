import { msg, T, useGT } from "gt-react";

import { APP_VERSION } from "../../branding";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { InlineButton } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** The version this is: the desktop app's own where it says one (`version`), else the web app's. */
export function AboutVersionTitle(props: { readonly version?: string | undefined }) {
  const gt = useGT();
  const version = props.version || APP_VERSION;
  const { copyToClipboard } = useCopyToClipboard<void>({
    target: {
      target: "version",
      unavailableMessage: msg("Clipboard API is unavailable while copying version."),
      failureMessage: msg("Failed to copy version to the clipboard."),
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: gt("Could not copy version"),
          description: error.message,
        }),
      );
    },
  });

  return (
    <span className="inline-flex items-baseline gap-2">
      <span>
        <T>Version</T>
      </span>
      <span className="text-2xs font-medium tabular-nums">
        <Tooltip>
          <TooltipTrigger
            render={
              <InlineButton
                tone="muted"
                aria-label={gt("Copy version {version}", { version })}
                onClick={() => copyToClipboard(version, undefined)}
              >
                {version}
              </InlineButton>
            }
          />
          <TooltipPopup>
            <T>Copy version</T>
          </TooltipPopup>
        </Tooltip>
      </span>
    </span>
  );
}
