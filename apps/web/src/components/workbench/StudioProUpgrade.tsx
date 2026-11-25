import {
  defaultInstanceIdForDriver,
  type EnvironmentId,
  ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { CreditCardIcon } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";

import { readLocalApi } from "~/localApi";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
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
import { Radio, RadioGroup } from "../ui/radio-group";
import { toastManager } from "../ui/toast";
import { HARDWARE_FOCUS } from "./hardwareActions";
import {
  checkProClaim,
  instanceWithoutPro,
  newProClaim,
  normalizedProKey,
  proAccountIn,
  proAccountOf,
  proInstance,
  proManageUrl,
  type ProUsage,
  proUsageLine,
  proUpgradeUrl,
  readProUsage,
  STUDIO_PRO_PLANS,
  type StudioProPlan,
} from "./studioPro";
import { useProviderInstance } from "./useProviderInstance";

const CLAUDE = "claudeAgent";
const CLAUDE_INSTANCE = defaultInstanceIdForDriver(ProviderDriverKind.make(CLAUDE));
const CLAIM_POLL_MS = 3000;
const quiet = { reportFailure: false, reportDefect: false };

/** Opens a page in the person's own browser: the desktop app's, or a new tab on the web. */
function openInBrowser(url: string) {
  const api = readLocalApi();
  if (api) void api.shell.openExternal(url).catch(() => window.open(url, "_blank", "noopener"));
  else window.open(url, "_blank", "noopener");
}

/** The Claude instance with Pro's way in and out, and Claude checked again after each change. */
function useStudioPro(environmentId: EnvironmentId, instanceId: ProviderInstanceId) {
  const { instance, save } = useProviderInstance(environmentId, instanceId, CLAUDE, "Studio Pro");
  const refresh = useAtomCommand(serverEnvironment.refreshProviders, quiet);
  const saved = async (next: typeof instance) => {
    const failed = await save(next);
    if (failed === null) void refresh({ environmentId, input: {} });
    return failed;
  };
  return {
    account: proAccountIn(instance),
    start: (key: string) => saved(proInstance(instance, key)),
    stop: () => saved(instanceWithoutPro(instance)),
  };
}

/** This month's use for a Pro account, read once each time the row shows. */
function useProUsage(account: string | null) {
  const [usage, setUsage] = useState<{ account: string; read: ProUsage | { message: string } }>();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the account's month from Studio Pro's server when the row shows an account
  useEffect(() => {
    if (account === null) return;
    let current = true;
    void readProUsage(account).then((read) => {
      if (current) setUsage({ account, read });
    });
    return () => {
      current = false;
    };
  }, [account]);
  if (account === null || usage?.account !== account) return null;
  return "message" in usage.read ? usage.read.message : proUsageLine(usage.read);
}

/**
 * Upgrade: choose a plan, pay on Stripe's page in the browser, and Studio signs in by itself as the
 * payment goes through (it asks Studio Pro with the claim only it holds). A key from another
 * computer signs in the same way.
 */
export function StudioProDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId?: ProviderInstanceId;
  readonly onClose: () => void;
}) {
  const { environmentId, onClose } = props;
  const { start } = useStudioPro(environmentId, props.instanceId ?? CLAUDE_INSTANCE);
  const [plan, setPlan] = useState<StudioProPlan>("monthly");
  const [step, setStep] = useState<"plan" | "paying" | "key" | "saving">("plan");
  const [claim, setClaim] = useState<{ secret: string; url: string } | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = async (value: string) => {
    setStep("saving");
    const failed = await start(value);
    if (failed !== null) {
      setError(failed);
      setStep("plan");
      return;
    }
    toastManager.add({
      type: "success",
      title: "You're on Studio Pro",
      description: "Claude now runs on Studio Pro, with no subscription of its own.",
    });
    onClose();
  };

  const paid = useEffectEvent((value: string) => void finish(value));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks Studio Pro's server every few seconds whether the browser's checkout is paid, until it is or the dialog closes
  useEffect(() => {
    if (step !== "paying" || claim === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      const answer = await checkProClaim(claim.secret);
      if (stopped) return;
      if (answer.kind === "paid") paid(answer.key);
      else if (answer.kind === "failed") {
        setError(answer.message);
        setStep("plan");
      } else timer = setTimeout(ask, CLAIM_POLL_MS);
    };
    timer = setTimeout(ask, CLAIM_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [step, claim]);

  const upgrade = async () => {
    setError(null);
    const { secret, hash } = await newProClaim();
    const url = proUpgradeUrl(plan, hash);
    setClaim({ secret, url });
    setStep("paying");
    openInBrowser(url);
  };
  const submitKey = () => {
    const value = normalizedProKey(key);
    if (proAccountOf(value) === null) {
      setError("That is not a Studio Pro license key. It starts with SPRO-.");
      return;
    }
    setError(null);
    void finish(value);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "plan") void upgrade();
            else if (step === "key") submitKey();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {step === "key" ? "Use a license key" : "Upgrade to Studio Pro"}
            </DialogTitle>
            <DialogDescription>
              {step === "key"
                ? "Paste the key from the page you saw after paying, or from another computer."
                : "Studio's AI is included: Claude, or GPT if you choose it, with no subscription of their own. Your chats go through Studio's server and OpenRouter to that model; Studio keeps how much AI you used, never what you said."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {step === "plan" ? (
              <RadioGroup
                aria-label="Studio Pro plan"
                value={plan}
                onValueChange={(value) => setPlan(value as StudioProPlan)}
              >
                {STUDIO_PRO_PLANS.map((option) => (
                  <label
                    key={option.plan}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm"
                  >
                    <span className="pt-0.5">
                      <Radio value={option.plan} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">
                        {option.name} · {option.price}
                      </span>
                      <span className="text-xs text-muted-foreground">{option.detail}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            ) : step === "key" ? (
              <Input
                aria-label="License key"
                placeholder="SPRO-..."
                autoComplete="off"
                spellCheck={false}
                autoFocus
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            ) : (
              <div aria-live="polite" className="flex flex-col gap-2 text-sm">
                <p>
                  {step === "saving"
                    ? "Signing in to Studio Pro..."
                    : "Finish paying in your browser. Studio signs in by itself as soon as the payment goes through."}
                </p>
                {step === "paying" && claim !== null ? (
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openInBrowser(claim.url)}
                    >
                      Open the payment page again
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
            {error === null ? null : (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            {step === "plan" ? (
              <Button type="button" variant="ghost" onClick={() => setStep("key")}>
                I have a license key
              </Button>
            ) : step === "key" ? (
              <Button type="button" variant="ghost" onClick={() => setStep("plan")}>
                Back
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {step === "plan" || step === "key" ? (
              <Button type="submit" disabled={step === "key" && normalizedProKey(key) === ""}>
                {step === "plan" ? "Continue to payment" : "Use key"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * The welcome screen's Studio Pro row, beside the sign-in cards: the way to Studio's AI without a
 * Claude subscription, and while on it, the month's use and the way back.
 */
export function StudioProRow(props: { readonly environmentId: EnvironmentId }) {
  const { account, stop } = useStudioPro(props.environmentId, CLAUDE_INSTANCE);
  const usage = useProUsage(account);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3">
      <CreditCardIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">Studio Pro</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {account === null
            ? "Studio's AI included, so you don't need a Claude subscription. $49 a month."
            : (usage ?? "Claude runs on Studio Pro.")}
        </p>
        {error === null ? null : (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {account === null ? (
        <Button size="sm" onClick={() => setUpgrading(true)}>
          Upgrade
        </Button>
      ) : (
        <Button size="sm" variant="ghost-muted" onClick={() => void stop().then(setError)}>
          Stop using it
        </Button>
      )}
      {upgrading ? (
        <StudioProDialog environmentId={props.environmentId} onClose={() => setUpgrading(false)} />
      ) : null}
    </div>
  );
}

/**
 * Settings' Studio Pro row on the Claude instance, in Studio only: Upgrade or a key while Claude is
 * the person's own; the month's use, billing and the way back while it runs on Pro.
 */
function StudioProSettingsRow(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly readOnly: boolean;
}) {
  const { account, stop } = useStudioPro(props.environmentId, props.instanceId);
  const usage = useProUsage(account);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border-b border-border/50">
      <SettingsRow
        title="Studio Pro"
        description={
          account === null
            ? "Use Claude without a subscription: Studio's AI is included, $49 a month."
            : (usage ?? "Claude runs on Studio Pro.")
        }
        control={
          account === null ? (
            <Button size="sm" disabled={props.readOnly} onClick={() => setUpgrading(true)}>
              Upgrade
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openInBrowser(proManageUrl())}>
                Billing
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={props.readOnly}
                onClick={() => void stop().then(setError)}
              >
                Stop using it
              </Button>
            </div>
          )
        }
      >
        {error === null ? null : (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </SettingsRow>
      {upgrading ? (
        <StudioProDialog
          environmentId={props.environmentId}
          instanceId={props.instanceId}
          onClose={() => setUpgrading(false)}
        />
      ) : null}
    </div>
  );
}

/** The welcome screen's privacy line for Pro, in Studio: what passes through when it is on. */
export function StudioProPrivacyNote() {
  if (!HARDWARE_FOCUS) return null;
  return " With Studio Pro on, your chats go through Studio's server and OpenRouter to the model you chose; Studio keeps only how much AI you used.";
}

/** Settings' setup for a provider instance, with the Studio Pro row first on Claude's, in Studio. */
export function withStudioProRow(
  setup: ReactNode,
  input: {
    readonly driver: string;
    readonly mode: string;
    readonly environmentId: EnvironmentId;
    readonly instanceId: ProviderInstanceId;
    readonly readOnly: boolean;
  },
): ReactNode {
  if (!HARDWARE_FOCUS || input.driver !== CLAUDE || input.mode !== "editor") return setup;
  return (
    <>
      <StudioProSettingsRow
        environmentId={input.environmentId}
        instanceId={input.instanceId}
        readOnly={input.readOnly}
      />
      {setup}
    </>
  );
}
