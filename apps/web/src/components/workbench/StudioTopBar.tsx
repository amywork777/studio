import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { APP_BASE_NAME } from "~/branding";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { T3Wordmark } from "../T3Wordmark";
import { useSidebar } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

/**
 * Studio's mark and name, which lead Home and Studio's other pages while the chats are folded
 * away: how every engineering page starts its top bar then. A project's workspace leads with its
 * switcher instead (`StudioWorkspaceBar`).
 */
function StudioNav() {
  return (
    <nav aria-label={APP_BASE_NAME} className="flex shrink-0 items-center">
      <Link
        to="/"
        className="flex items-center gap-1.5 rounded-md text-sm font-semibold text-foreground outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset"
      >
        <T3Wordmark aria-hidden className="h-4 w-auto shrink-0" />
        {APP_BASE_NAME}
      </Link>
    </nav>
  );
}

/**
 * The top bar of Studio's Home: the mark and name, then the page's controls at the end. While the
 * chats show down the left, the sidebar's own header carries the mark, as in a project's workspace.
 */
export function StudioTopBar(props: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  const { isMobile, open } = useSidebar();
  return (
    <WorkspacePageHeader
      electron={isElectron}
      className={cn("border-b border-border bg-background", props.className)}
    >
      {open && !isMobile ? null : <StudioNav />}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{props.children}</div>
    </WorkspacePageHeader>
  );
}
