import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { CheckIcon, TicketIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getOnboardingProviderState } from "~/onboarding/providerReadiness.logic";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { CodexWelcomeCard } from "../settings/CodexSetupSection";
import { readCodexSetupMode } from "../settings/CodexSetupSection.logic";
import { getProviderSummary } from "../settings/providerStatus";
import { buildProviderInstanceUpdatePatch } from "../settings/SettingsPanels.logic";
import { SettingsRow } from "../settings/settingsLayout";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  checkInviteCode,
  instanceWithoutInvite,
  inviteInstallProgress,
  inviteInstallStep,
  inviteInstance,
  normalizedInviteCode,
  usesInvite,
  workingCodexBinary,
} from "./codexInvite";
import { useEngineeringInterface } from "./studioInterface";

const quiet = { reportFailure: false, reportDefect: false };

/** The Codex instance as saved, and a way to save it changed. Save answers an error, or null. */
function useCodexInstance(environmentId: EnvironmentId, instanceId: ProviderInstanceId) {
  const settings = useAtomValue(serverEnvironment.configValueAtom(environmentId))?.settings;
  const update = useAtomCommand(serverEnvironment.updateSettings, {
    label: "Invite code",
    ...quiet,
  });
  const instance: ProviderInstanceConfig = settings?.providerInstances[instanceId] ?? {
    driver: ProviderDriverKind.make("codex"),
  };
  const save = async (next: ProviderInstanceConfig) => {
    if (!settings) return "Studio is still connecting. Try again in a moment.";
    const result = await update({
      environmentId,
      input: { patch: buildProviderInstanceUpdatePatch({ settings, instanceId, instance: next }) },
    });
    if (result._tag === "Success" || isAtomCommandInterrupted(result)) return null;
    const failure = squashAtomCommandFailure(result);
    return failure instanceof Error ? failure.message : "Could not save. Try again.";
  };
  return { instance, save };
}

/**
 * Finds or installs Codex with Studio's own installer, then hands back where it is. It runs only
 * while the instance is on Studio's own setup, the one setup the installer serves.
 */
function InviteInstaller(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly onReady: (binaryPath: string) => void;
  readonly onFailed: (message: string) => void;
}) {
  const target = { environmentId: props.environmentId, input: { instanceId: props.instanceId } };
  const installQuery = useEnvironmentQuery(serverEnvironment.providerInstallState(target));
  const startInstall = useAtomCommand(serverEnvironment.startProviderInstall, quiet);
  const installation = installQuery.data ?? null;
  const [started, setStarted] = useState<string | null | undefined>(undefined);
  const starting = useRef(false);
  const done = useRef(false);
  const { onReady, onFailed } = props;
  const step = installQuery.error
    ? ({ kind: "failed", message: "Could not read Codex's setup. Try again." } as const)
    : inviteInstallStep(installation, started);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts the install over RPC once and reports when the server's install state settles; the refs keep one start and one report
  useEffect(() => {
    if (done.current) return;
    if (step.kind === "ready") {
      done.current = true;
      onReady(step.binaryPath);
    } else if (step.kind === "failed") {
      done.current = true;
      onFailed(step.message);
    } else if (step.kind === "install" && !starting.current) {
      starting.current = true;
      void startInstall({ environmentId: target.environmentId, input: target.input }).then(
        (result) => {
          if (result._tag === "Success") setStarted(result.value.operationId);
          else if (!done.current) {
            done.current = true;
            const failure = squashAtomCommandFailure(result);
            onFailed(
              failure instanceof Error
                ? failure.message
                : "Codex could not be installed. Try again.",
            );
          }
        },
      );
    }
  });

  return (
    <p aria-live="polite" className="text-xs text-muted-foreground">
      {inviteInstallProgress(installation)}
    </p>
  );
}

/**
 * Paste an invite code: the server checks it, Codex is found or installed, and the instance is
 * saved on the code. Its owner keeps it mounted while Codex's own card changes underneath.
 */
export function CodexInviteDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  /** Codex works already, so the code must not put that at risk on its way in. */
  readonly codexReady?: boolean;
  readonly onClose: () => void;
}) {
  const { environmentId, instanceId, onClose } = props;
  const { instance, save } = useCodexInstance(environmentId, instanceId);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"code" | "checking" | "codex" | "saving">("code");
  const [error, setError] = useState<string | null>(null);
  const accepted = useRef("");

  const stop = (message: string) => {
    setError(message);
    setStep("code");
  };
  const finish = async (binaryPath: string) => {
    setStep("saving");
    const failed = await save(inviteInstance(instance, accepted.current, binaryPath));
    if (failed !== null) stop(failed);
    else onClose();
  };
  const submit = async () => {
    const value = normalizedInviteCode(code);
    if (value.length === 0 || step !== "code") return;
    setError(null);
    setStep("checking");
    const check = await checkInviteCode(value);
    if (!check.ok) return stop(check.message);
    accepted.current = value;
    const working = workingCodexBinary(instance.config, props.codexReady === true);
    if (working !== null) return finish(working);
    // Only Studio's own setup installs Codex, so the instance is on it while Codex is found.
    if (readCodexSetupMode(instance.config) !== "managed") {
      const failed = await save(instanceWithoutInvite(instance));
      if (failed !== null) return stop(failed);
    }
    setStep("codex");
  };

  const busy = step !== "code";
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Use an invite code</DialogTitle>
            <DialogDescription>
              Paste the code from your invite. With it, Studio's AI works without a subscription.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-2">
              <Input
                aria-label="Invite code"
                placeholder="STUDIO-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={busy}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              {step === "codex" ? (
                <InviteInstaller
                  environmentId={environmentId}
                  instanceId={instanceId}
                  onReady={(binaryPath) => void finish(binaryPath)}
                  onFailed={stop}
                />
              ) : null}
              {error === null ? null : (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || normalizedInviteCode(code).length === 0}>
              {step === "checking"
                ? "Checking..."
                : step === "codex"
                  ? "Setting up..."
                  : step === "saving"
                    ? "Saving..."
                    : "Use code"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * The welcome screen's invite row, in Studio only, beside Claude's and Codex's cards: a friend with
 * a code uses it here without knowing it sets up Codex. It stays whatever is signed in, and goes
 * only once Codex is on a code, when Codex's card says so and holds the way back. Its dialog belongs
 * to the screen, which stays while Codex's card changes setup underneath.
 */
export function InviteCodeRow(props: { readonly config: unknown; readonly onUse: () => void }) {
  const engineering = useEngineeringInterface();
  if (!engineering || usesInvite(props.config)) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3">
      <TicketIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">Invite code</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Have a code someone sent you? Use it instead of a subscription.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={props.onUse}>
        Use an invite code
      </Button>
    </div>
  );
}

/** The welcome screen's Codex card while Codex runs on an invite code. */
export function CodexInviteCard(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | undefined;
}) {
  const { instance, save } = useCodexInstance(props.environmentId, props.instanceId);
  const [error, setError] = useState<string | null>(null);
  const state = getOnboardingProviderState(props.provider);
  return (
    <CodexWelcomeCard
      title={props.provider?.displayName || "Codex"}
      description={
        state === "ready"
          ? "Using an invite code."
          : state === "checking"
            ? "Checking Codex..."
            : getProviderSummary(props.provider).headline
      }
      control={
        state === "ready" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-foreground">
            <CheckIcon className="size-3.5" />
            Ready
          </span>
        ) : state === "checking" ? (
          <span className="text-xs text-muted-foreground">Checking...</span>
        ) : null
      }
      secondaryControl={
        <Button
          size="sm"
          variant="ghost-muted"
          onClick={() => void save(instanceWithoutInvite(instance)).then(setError)}
        >
          Stop using it
        </Button>
      }
    >
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </CodexWelcomeCard>
  );
}

/**
 * Settings' invite row for a Codex instance, in Studio only: the way in while Codex is not signed
 * in, and the way out while it runs on a code.
 */
export function CodexInviteSettingsRow(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | undefined;
  readonly readOnly: boolean;
}) {
  const engineering = useEngineeringInterface();
  const { instance, save } = useCodexInstance(props.environmentId, props.instanceId);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invited = usesInvite(instance.config);
  if (!engineering || (!invited && props.provider?.auth.status === "authenticated")) return null;
  return (
    <div className="border-t border-border/50">
      <SettingsRow
        title="Invite code"
        description={
          invited
            ? "Codex runs on an invite, without a ChatGPT plan."
            : "Use one instead of a ChatGPT account."
        }
        control={
          invited ? (
            <Button
              size="sm"
              variant="outline"
              disabled={props.readOnly}
              onClick={() => void save(instanceWithoutInvite(instance)).then(setError)}
            >
              Stop using it
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={props.readOnly}
              onClick={() => setInviting(true)}
            >
              Use an invite code
            </Button>
          )
        }
      >
        {error === null ? null : (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </SettingsRow>
      {inviting ? (
        <CodexInviteDialog
          environmentId={props.environmentId}
          instanceId={props.instanceId}
          onClose={() => setInviting(false)}
        />
      ) : null}
    </div>
  );
}
