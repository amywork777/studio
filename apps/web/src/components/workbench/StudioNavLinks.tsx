import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  HomeIcon,
  type LucideIcon,
  MessageCircleIcon,
  SettingsIcon,
  ToolCaseIcon,
  Trash2Icon,
} from "lucide-react";

import { TEXT_TO_CAD_DISCORD } from "../settings/textToCadVersion";
import { Badge } from "../ui/badge";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar";
import { useAllChats, waitingChats } from "./allChats";
import { libraryHref } from "./library/librarySearch";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { railMark } from "./studioPlaces";

/** Where each place's page is. */
type PlacePage = "/" | "/trash" | "/settings";

/**
 * Opens the Library, or one of its entries, as the sidebar and ⌘K do: from a project, its Make one
 * comes back there, where its New is.
 */
export function useOpenLibrary() {
  const navigate = useNavigate();
  const router = useRouter();
  const inProject = useOpenWorkspaceStore((store) => store.workspace !== null);
  return (entry?: string) =>
    void navigate(
      libraryHref({
        ...(entry === undefined ? {} : { entry }),
        ...(inProject ? { from: router.state.location.href } : {}),
      }),
    );
}

/**
 * Studio's places in the sidebar column: Home on top with how many chats wait on the person, the
 * Library under it, Trash and Settings at the foot. The Chats and Projects pages stay a link away
 * from Home.
 */
export function StudioHomeLink(props: { readonly environmentId: EnvironmentId }) {
  const waiting = waitingChats(useAllChats(props.environmentId).chats).length;
  const { mark, go, leave } = usePlaces();
  const openLibrary = useOpenLibrary();
  return (
    <SidebarMenu aria-label="Studio">
      <PlaceItem
        icon={HomeIcon}
        label="Home"
        count={waiting}
        marked={mark === "home"}
        onClick={() => go("/")}
      />
      <PlaceItem
        icon={ToolCaseIcon}
        label="Toolbox"
        marked={mark === "library"}
        onClick={() => {
          leave();
          openLibrary();
        }}
      />
    </SidebarMenu>
  );
}

/**
 * Feedback, Trash and Settings, at the foot of the column (`StudioHomeLink`). Feedback opens the
 * Discord Studio shares with text-to-cad, in the browser. Inside Settings its row goes: pressing it
 * would do nothing, its section rows in the column above say where the person is, and Back is the
 * way out.
 */
export function StudioFootLinks() {
  const { mark, go } = usePlaces();
  return (
    <SidebarMenu aria-label="More">
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-label="Feedback, on Discord"
          render={<a href={TEXT_TO_CAD_DISCORD} target="_blank" rel="noreferrer noopener" />}
        >
          <MessageCircleIcon aria-hidden="true" />
          <span className="flex-1">Feedback</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <PlaceItem
        icon={Trash2Icon}
        label="Trash"
        marked={mark === "trash"}
        onClick={() => go("/trash")}
      />
      {mark === "settings" ? null : (
        <PlaceItem
          icon={SettingsIcon}
          label="Settings"
          marked={false}
          onClick={() => go("/settings")}
        />
      )}
    </SidebarMenu>
  );
}

function usePlaces() {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const leave = () => {
    if (isMobile) setOpenMobile(false);
  };
  const go = (to: PlacePage) => {
    leave();
    void navigate({ to });
  };
  return { mark: railMark(pathname), go, leave };
}

function PlaceItem(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly marked: boolean;
  readonly count?: number;
  readonly onClick: () => void;
}) {
  const Icon = props.icon;
  const count = props.count ?? 0;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={props.marked}
        aria-current={props.marked ? "page" : undefined}
        aria-label={count > 0 ? `${props.label}, ${count} waiting on you` : props.label}
        onClick={props.onClick}
      >
        <Icon aria-hidden="true" />
        <span className="flex-1">{props.label}</span>
        {count > 0 ? (
          <Badge aria-hidden="true" variant="default" size="sm">
            {count > 9 ? "9+" : count}
          </Badge>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
