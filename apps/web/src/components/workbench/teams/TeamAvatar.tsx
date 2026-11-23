import { LockIcon } from "lucide-react";
import type { CSSProperties } from "react";

/**
 * A person's colour, the same everywhere they appear: a hue from their email, kept between cyan
 * and magenta so no one's face reads as red, amber or green, which Studio keeps for status.
 */
function avatarHue(email: string): number {
  let hash = 0;
  for (const char of email.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 190 + (hash % 140);
}

const SIZE = {
  sm: "size-5 text-[0.625rem]",
  md: "size-7 text-xs",
} as const;

/** A teammate as an initial in their colour; `locked` marks the one who has the project checked out. */
export function TeamAvatar(props: {
  readonly email: string;
  readonly size?: keyof typeof SIZE;
  readonly locked?: boolean;
}) {
  const { email, size = "sm", locked = false } = props;
  const hue = avatarHue(email);
  const style: CSSProperties = {
    backgroundColor: `hsl(${hue} 48% 46%)`,
    color: "hsl(0 0% 100%)",
  };
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full font-semibold uppercase ${SIZE[size]}`}
      style={style}
      aria-hidden="true"
    >
      {email.charAt(0)}
      {locked ? (
        <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-background text-foreground ring-1 ring-border">
          <LockIcon className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}

/** The team's faces in a row, the way shared documents show who is on them. */
export function TeamAvatarStack(props: {
  readonly emails: ReadonlyArray<string>;
  readonly max?: number;
}) {
  const { emails, max = 4 } = props;
  const shown = emails.slice(0, max);
  const more = emails.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((email, index) => (
        <span
          key={email}
          className={
            index === 0
              ? "rounded-full ring-2 ring-background"
              : "-ms-1.5 rounded-full ring-2 ring-background"
          }
        >
          <TeamAvatar email={email} />
        </span>
      ))}
      {more > 0 ? <span className="ms-1 text-xs text-muted-foreground">+{more}</span> : null}
      <span className="sr-only">On the team: {emails.join(", ")}</span>
    </span>
  );
}
