import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, StudioGitHubSignInStartResult } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useStableCallback } from "../../hooks/useStableCallback";
import { readLocalApi } from "../../localApi";
import { studioProjectsEnvironment } from "../../state/studioProjects";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

/** GitHub's rule for a `slow_down` answer: five seconds more between checks, from then on. */
const SLOW_DOWN_SECONDS = 5;

const failureMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "GitHub could not be reached. Try again.";

/**
 * Sign in with GitHub, for Back up and Settings: Studio shows a code, the person enters it at
 * GitHub, and the server saves the token once they have. Nothing to install and nothing to paste.
 */
export function GitHubSignIn(props: {
  readonly environmentId: EnvironmentId;
  readonly onSignedIn: () => void;
}) {
  const { environmentId } = props;
  const start = useAtomCommand(studioProjectsEnvironment.gitHubSignInStart, {
    reportFailure: false,
  });
  const check = useAtomCommand(studioProjectsEnvironment.gitHubSignInCheck, {
    reportFailure: false,
  });
  const [code, setCode] = useState<StudioGitHubSignInStartResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { copyToClipboard } = useCopyToClipboard<void>();
  const onSignedIn = useStableCallback(props.onSignedIn);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls GitHub on a timer, one check at a time, while the code is on screen.
  useEffect(() => {
    if (code === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let intervalSeconds = code.intervalSeconds;
    const stop = (note: string | null) => {
      setCode(null);
      setMessage(note);
    };
    const next = () => {
      timer = setTimeout(() => void ask(), intervalSeconds * 1000);
    };
    const ask = async () => {
      const result = await check({ environmentId, input: { deviceCode: code.deviceCode } });
      if (stopped) return;
      if (result._tag === "Failure") {
        stop(failureMessage(squashAtomCommandFailure(result)));
        return;
      }
      switch (result.value.state) {
        case "signed-in":
          stop(null);
          onSignedIn();
          return;
        case "expired":
          stop("That code expired. Sign in again for a new one.");
          return;
        case "denied":
          stop("GitHub says the sign-in was cancelled.");
          return;
        case "slow-down":
          intervalSeconds += SLOW_DOWN_SECONDS;
          next();
          return;
        case "waiting":
          next();
      }
    };
    next();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [check, code, environmentId, onSignedIn]);

  const begin = async () => {
    setStarting(true);
    setMessage(null);
    const result = await start({ environmentId, input: {} });
    setStarting(false);
    if (result._tag === "Failure") {
      setMessage(failureMessage(squashAtomCommandFailure(result)));
      return;
    }
    setCode(result.value);
  };

  const openGitHub = (started: StudioGitHubSignInStartResult) => {
    copyToClipboard(started.userCode);
    void readLocalApi()
      ?.shell.openExternal(started.verificationUri)
      .catch(() => setMessage("GitHub could not be opened. Go to github.com/login/device."));
  };

  if (code === null) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={starting} onClick={() => void begin()}>
          Sign in with GitHub
        </Button>
        {message === null ? null : <p className="text-xs text-muted-foreground">{message}</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <p className="text-xs leading-snug text-muted-foreground">
        Enter this code at GitHub. Studio carries on by itself once you have.
      </p>
      <p className="text-2xl font-semibold tabular-nums tracking-widest" aria-live="polite">
        {code.userCode}
      </p>
      {message === null ? null : <p className="text-xs text-muted-foreground">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openGitHub(code)}>
          Copy code and open GitHub
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCode(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
