import {
  defaultInstanceIdForDriver,
  type EnvironmentId,
  ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { CheckIcon, CreditCardIcon } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";

import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { SettingsRow } from "../settings/settingsLayout";
import { Badge } from "../ui/badge";
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
import { toastManager } from "../ui/toast";
import { HARDWARE_FOCUS } from "./hardwareActions";
import {
  checkProClaim,
  instanceWithoutOwnKey,
  newProClaim,
  normalizedProKey,
  type OwnKeyKind,
  ownKeyIn,
  ownKeyInstance,
  ownKeyKind,
  proAccountIn,
  proAccountOf,
  proInstance,
  proManageUrl,
  proTopUpUrl,
  type ProUsage,
  proUsageLine,
  proUpgradeUrl,
  readProUsage,
  STUDIO_PRO_PLANS,
  STUDIO_PRO_TOPUPS,
  type StudioProPlan,
} from "./studioPro";
import { useProviderInstance } from "./useProviderInstance";

const CLAUDE = "claudeAgent";
const CLAUDE_INSTANCE = defaultInstanceIdForDriver(ProviderDriverKind.make(CLAUDE));
const POLL_MS = 3000;
const quiet = { reportFailure: false, reportDefect: false };
const OWN_KEY_NAMES: Record<OwnKeyKind, string> = {
  anthropic: "your own Anthropic API key",
  openrouter: "your own OpenRouter API key",
};

/** Opens a page in the person's own browser: the desktop app's, or a new tab on the web. */
function openInBrowser(url: string) {
  const api = readLocalApi();
  if (api) void api.shell.openExternal(url).catch(() => window.open(url, "_blank", "noopener"));
  else window.open(url, "_blank", "noopener");
}

/**
 * The Claude instance with the ways Studio pays for its AI, Pro or the person's own API key, the way
 * back to their sign-in, and Claude checked again after each change.
 */
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
    ownKey: ownKeyIn(instance),
    start: (key: string) => saved(proInstance(instance, key)),
    startOwnKey: (key: string) => saved(ownKeyInstance(instance, key)),
    stop: () => saved(instanceWithoutOwnKey(instance)),
  };
}

/** This week's use for a Pro account, read each time the row shows and after AI is added. */
function useProUsage(account: string | null, version: number) {
  const [usage, setUsage] = useState<{
    account: string;
    version: number;
    read: ProUsage | { message: string };
  }>();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the account's week from Studio Pro's server when the row shows an account, and again after AI is added
  useEffect(() => {
    if (account === null) return;
    let current = true;
    void readProUsage(account).then((read) => {
      if (current) setUsage({ account, version, read });
    });
    return () => {
      current = false;
    };
  }, [account, version]);
  if (account === null || usage?.account !== account) return null;
  return "message" in usage.read ? usage.read.message : proUsageLine(usage.read);
}

/** One plan's card: what it is for, its price, what it includes, and the way to pay for it. */
function StudioProPlanCard(props: {
  readonly option: (typeof STUDIO_PRO_PLANS)[number];
  readonly onChoose: () => void;
}) {
  const { option } = props;
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-5",
        option.recommended ? "border-foreground shadow-lg" : "border-border",
      )}
    >
      {option.recommended ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <Badge>Recommended</Badge>
        </span>
      ) : null}
      <h3 className="text-base font-semibold tracking-tight">{option.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{option.tagline}</p>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{option.price}</span>
        <span className="text-sm text-muted-foreground">/mo</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Billed monthly</p>
      <div className="mt-5 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{option.lead}</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {option.includes.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-snug">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
      <Button
        type="button"
        className="mt-6 w-full"
        variant={option.recommended ? "default" : "outline"}
        onClick={props.onChoose}
      >
        Get {option.name}
      </Button>
    </div>
  );
}

/**
 * Upgrade: choose a plan, pay on Stripe's page in the browser, and Studio signs in by itself as the
 * payment goes through (it asks Studio Pro with the claim only it holds). A key from another
 * computer signs in the same way, and a person's own API key is the way with no Studio limit.
 */
export function StudioProDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId?: ProviderInstanceId;
  readonly onClose: () => void;
}) {
  const { environmentId, onClose } = props;
  const { start, startOwnKey } = useStudioPro(environmentId, props.instanceId ?? CLAUDE_INSTANCE);
  const [step, setStep] = useState<"plan" | "paying" | "key" | "ownKey" | "saving">("plan");
  const [claim, setClaim] = useState<{ secret: string; url: string } | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finish = async (value: string, own: boolean) => {
    const back = own ? "ownKey" : "plan";
    setStep("saving");
    const failed = await (own ? startOwnKey(value) : start(value));
    if (failed !== null) {
      setError(failed);
      setStep(back);
      return;
    }
    toastManager.add({
      type: "success",
      title: own ? "Claude runs on your own API key" : "You're on Studio Pro",
      description: own
        ? "Its provider bills you for what it uses, with no Studio limit."
        : "Claude now runs on Studio Pro, with no subscription of its own.",
    });
    onClose();
  };

  const paid = useEffectEvent((value: string) => void finish(value, false));
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
      } else timer = setTimeout(ask, POLL_MS);
    };
    timer = setTimeout(ask, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [step, claim]);

  const upgrade = async (plan: StudioProPlan) => {
    setError(null);
    const { secret, hash } = await newProClaim();
    const url = proUpgradeUrl(plan, hash);
    setClaim({ secret, url });
    setStep("paying");
    openInBrowser(url);
  };
  const goTo = (next: "plan" | "key" | "ownKey") => {
    setKey("");
    setError(null);
    setStep(next);
  };
  const submitKey = () => {
    const value = normalizedProKey(key);
    const own = step === "ownKey";
    if (own ? ownKeyKind(value) === null : proAccountOf(value) === null) {
      setError(
        own
          ? "That is not an Anthropic or OpenRouter API key. It starts with sk-ant- or sk-or-."
          : "That is not a Studio Pro license key. It starts with SPRO-.",
      );
      return;
    }
    setError(null);
    void finish(value, own);
  };
  const typing = step === "key" || step === "ownKey";

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className={step === "plan" ? "max-w-2xl" : "max-w-md"}>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (typing) submitKey();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {step === "key"
                ? "Use a license key"
                : step === "ownKey"
                  ? "Use your own API key"
                  : "Upgrade to Studio Pro"}
            </DialogTitle>
            <DialogDescription>
              {step === "key"
                ? "Paste the key from the page you saw after paying, or from another computer."
                : step === "ownKey"
                  ? "Paste an Anthropic key or an OpenRouter key. Claude runs on it with no Studio limit, and that provider bills you for what it uses. The key stays on this computer, and Stop using it takes it off."
                  : "Pick a plan, switch or cancel any time. Studio's AI is included, so Claude or GPT needs no subscription of its own."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {step === "plan" ? (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 pt-2 sm:grid-cols-2">
                  {STUDIO_PRO_PLANS.map((option) => (
                    <StudioProPlanCard
                      key={option.plan}
                      option={option}
                      onChoose={() => void upgrade(option.plan)}
                    />
                  ))}
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Building all day? Add AI to either plan any time, or use your own API key with no
                  Studio limit.
                </p>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  Your chats go through Studio's server and OpenRouter to the model you chose;
                  Studio keeps how much AI you used, never what you said. Your own Claude or Codex
                  sign-in stays free.
                </p>
              </div>
            ) : typing ? (
              <Input
                aria-label={step === "key" ? "License key" : "API key"}
                placeholder={step === "key" ? "SPRO-..." : "sk-ant-... or sk-or-v1-..."}
                type={step === "ownKey" ? "password" : "text"}
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
                    ? "Setting Claude up..."
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
              <>
                <Button type="button" variant="ghost" onClick={() => goTo("ownKey")}>
                  Use my own API key
                </Button>
                <Button type="button" variant="ghost" onClick={() => goTo("key")}>
                  I have a license key
                </Button>
              </>
            ) : typing ? (
              <Button type="button" variant="ghost" onClick={() => goTo("plan")}>
                Back
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {typing ? (
              <Button type="submit" disabled={normalizedProKey(key) === ""}>
                Use key
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Add AI: one payment in the browser for AI on top of the plan, used once the week's runs out.
 * The dialog asks Studio Pro until the added AI shows, then says so.
 */
function StudioProTopUpDialog(props: {
  readonly account: string;
  readonly onClose: () => void;
  readonly onAdded: () => void;
}) {
  const { account, onClose } = props;
  const [paying, setPaying] = useState<{ usd: number; before: number; url: string } | null>(null);

  const added = useEffectEvent((usd: number) => {
    toastManager.add({
      type: "success",
      title: `$${usd} of AI added`,
      description: "Studio Pro uses it once this week's AI runs out.",
    });
    props.onAdded();
    onClose();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks Studio Pro's server every few seconds whether the browser's payment for added AI went through, until it did or the dialog closes
  useEffect(() => {
    if (paying === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async () => {
      const read = await readProUsage(account);
      if (stopped) return;
      if (!("message" in read) && (read.addedUsd ?? 0) > paying.before) added(paying.usd);
      else timer = setTimeout(ask, POLL_MS);
    };
    timer = setTimeout(ask, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [paying, account]);

  const choose = async (usd: number) => {
    const read = await readProUsage(account);
    const url = proTopUpUrl(account, usd);
    setPaying({ usd, before: "message" in read ? 0 : (read.addedUsd ?? 0), url });
    openInBrowser(url);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add AI</DialogTitle>
          <DialogDescription>
            Added AI costs what it buys. Studio Pro uses it once this week's AI runs out, and it
            keeps from week to week while you're subscribed.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {paying === null ? (
            <div className="grid grid-cols-3 gap-3">
              {STUDIO_PRO_TOPUPS.map((usd) => (
                <Button key={usd} type="button" variant="outline" onClick={() => void choose(usd)}>
                  Add ${usd}
                </Button>
              ))}
            </div>
          ) : (
            <div aria-live="polite" className="flex flex-col gap-2 text-sm">
              <p>
                Finish paying in your browser. The ${paying.usd} of AI is added as soon as the
                payment goes through.
              </p>
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openInBrowser(paying.url)}
                >
                  Open the payment page again
                </Button>
              </div>
            </div>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {paying === null ? "Cancel" : "Close"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** What a Studio Pro row says: the offer, the week's use on Pro, or whose key Claude runs on. */
function rowLine(
  pro: { readonly account: string | null; readonly ownKey: OwnKeyKind | null },
  usage: string | null,
  offer: string,
) {
  if (pro.account !== null) return usage ?? "Claude runs on Studio Pro.";
  if (pro.ownKey !== null)
    return `Claude runs on ${OWN_KEY_NAMES[pro.ownKey]}, with no Studio limit.`;
  return offer;
}

/**
 * The welcome screen's Studio Pro row, beside the sign-in cards: the way to Studio's AI without a
 * Claude subscription; while on it, the week's use, Add AI and the way back; and on the person's own
 * API key, the way back from that.
 */
export function StudioProRow(props: { readonly environmentId: EnvironmentId }) {
  const pro = useStudioPro(props.environmentId, CLAUDE_INSTANCE);
  const [version, setVersion] = useState(0);
  const usage = useProUsage(pro.account, version);
  const [open, setOpen] = useState<"upgrade" | "topUp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const off = pro.account === null && pro.ownKey === null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3">
      <CreditCardIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium">Studio Pro</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {rowLine(
            pro,
            usage,
            "Studio's AI included, so you don't need a Claude subscription. From $20 a month.",
          )}
        </p>
        {error === null ? null : (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {off ? (
        <Button size="sm" onClick={() => setOpen("upgrade")}>
          Upgrade
        </Button>
      ) : (
        <div className="flex gap-2">
          {pro.account === null ? null : (
            <Button size="sm" variant="outline" onClick={() => setOpen("topUp")}>
              Add AI
            </Button>
          )}
          <Button size="sm" variant="ghost-muted" onClick={() => void pro.stop().then(setError)}>
            Stop using it
          </Button>
        </div>
      )}
      {open === "upgrade" ? (
        <StudioProDialog environmentId={props.environmentId} onClose={() => setOpen(null)} />
      ) : null}
      {open === "topUp" && pro.account !== null ? (
        <StudioProTopUpDialog
          account={pro.account}
          onClose={() => setOpen(null)}
          onAdded={() => setVersion((at) => at + 1)}
        />
      ) : null}
    </div>
  );
}

/**
 * Settings' Studio Pro row on the Claude instance, in Studio only: Upgrade, a license key or the
 * person's own API key while Claude is on their sign-in; the week's use, Add AI, billing and the way
 * back while it runs on Pro; and the way back from their own key.
 */
function StudioProSettingsRow(props: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly readOnly: boolean;
}) {
  const pro = useStudioPro(props.environmentId, props.instanceId);
  const [version, setVersion] = useState(0);
  const usage = useProUsage(pro.account, version);
  const [open, setOpen] = useState<"upgrade" | "topUp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const off = pro.account === null && pro.ownKey === null;
  return (
    <div className="border-b border-border/50">
      <SettingsRow
        title="Studio Pro"
        description={rowLine(
          pro,
          usage,
          "Use Claude without a subscription: Studio's AI is included, from $20 a month.",
        )}
        control={
          off ? (
            <Button size="sm" disabled={props.readOnly} onClick={() => setOpen("upgrade")}>
              Upgrade
            </Button>
          ) : (
            <div className="flex gap-2">
              {pro.account === null ? null : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={props.readOnly}
                    onClick={() => setOpen("topUp")}
                  >
                    Add AI
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openInBrowser(proManageUrl())}>
                    Billing
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={props.readOnly}
                onClick={() => void pro.stop().then(setError)}
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
      {open === "upgrade" ? (
        <StudioProDialog
          environmentId={props.environmentId}
          instanceId={props.instanceId}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === "topUp" && pro.account !== null ? (
        <StudioProTopUpDialog
          account={pro.account}
          onClose={() => setOpen(null)}
          onAdded={() => setVersion((at) => at + 1)}
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
