import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { type FormEvent, useState } from "react";

import { studioTeamsEnvironment } from "~/state/studioTeams";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { useTeamAction } from "./teamWords";

/** Sign in with an emailed code: no password, and the same way on every computer. */
export function SignInForm(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const start = useAtomCommand(studioTeamsEnvironment.signInStart, { reportFailure: false });
  const check = useAtomCommand(studioTeamsEnvironment.signInCheck, { reportFailure: false });
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const action = useTeamAction();

  const send = (event: FormEvent) => {
    event.preventDefault();
    const to = email.trim();
    if (to === "") return;
    action.run(async () => {
      const result = await start({ environmentId, input: { email: to } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      setSentTo(to);
    });
  };
  const verify = (event: FormEvent) => {
    event.preventDefault();
    if (sentTo === null || code.trim() === "") return;
    action.run(async () => {
      const result = await check({ environmentId, input: { email: sentTo, code: code.trim() } });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    });
  };

  return (
    <>
      {sentTo === null ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={send}>
          <Input
            type="email"
            size="sm"
            className="max-w-72"
            placeholder="you@company.com"
            aria-label="Your work email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={action.busy || email.trim() === ""}>
            {action.busy ? "Sending" : "Email me a code"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-wrap items-center gap-2" onSubmit={verify}>
          <span className="text-xs text-muted-foreground">Code sent to {sentTo}.</span>
          <Input
            size="sm"
            className="w-28"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-label="Sign-in code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={action.busy || code.trim() === ""}>
            {action.busy ? "Signing in" : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost-muted"
            size="sm"
            disabled={action.busy}
            onClick={() => {
              setSentTo(null);
              setCode("");
            }}
          >
            Use another email
          </Button>
        </form>
      )}
      {action.error === null ? null : <p className="text-xs text-destructive">{action.error}</p>}
    </>
  );
}
