import {
  defaultInstanceIdForDriver,
  type EnvironmentId,
  ProviderDriverKind,
} from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import { NO_AGENT } from "./agentWords";
import { CodexInviteDialog } from "./CodexInviteCode";
import { StudioProDialog } from "./StudioProUpgrade";

/**
 * Studio: in place of a chat box that cannot send, the way to one that can: sign in to an AI
 * agent in Settings, Studio Pro (Claude on Studio's AI), or an invite code someone sent (Codex on
 * the code), as Welcome offers them.
 */
export function ConnectAgentCard(props: {
  readonly environmentId: EnvironmentId;
  /** Opens Settings, AI agents, at the agent to sign in to; null when none can be set up here. */
  readonly onConnect: (() => void) | null;
}) {
  const [inviting, setInviting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3"
      data-connect-agent=""
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{NO_AGENT}</p>
        <p className="text-xs text-muted-foreground">
          Connect your Claude or Codex subscription to design by describing, get Studio Pro with the
          AI included, or use an invite code someone sent you.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="xs" disabled={props.onConnect === null} onClick={() => props.onConnect?.()}>
          Connect an agent
        </Button>
        <Button size="xs" variant="outline" onClick={() => setUpgrading(true)}>
          Get Studio Pro
        </Button>
        <Button size="xs" variant="outline" onClick={() => setInviting(true)}>
          Use an invite code
        </Button>
      </div>
      {upgrading ? (
        <StudioProDialog environmentId={props.environmentId} onClose={() => setUpgrading(false)} />
      ) : null}
      {inviting ? (
        <CodexInviteDialog
          environmentId={props.environmentId}
          instanceId={defaultInstanceIdForDriver(ProviderDriverKind.make("codex"))}
          onClose={() => setInviting(false)}
        />
      ) : null}
    </div>
  );
}
