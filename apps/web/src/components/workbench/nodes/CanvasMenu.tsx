import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { Input } from "../../ui/input";

export interface CanvasMenuItem {
  readonly id: string;
  readonly label: string;
  /** The heading it is listed under: "Add", "Evaluate", "Manufacture" … */
  readonly group: string;
  readonly icon?: LucideIcon | undefined;
  /** The key that does the same, shown at the row's end: "⌫", "F". */
  readonly keys?: string | undefined;
  readonly onPick: () => void;
}

/**
 * The canvas's menu, where the pointer is: what can be added there, or done to the card under it.
 * Typing narrows it; the arrow keys and Return pick, Escape closes, as a node editor's search does.
 */
export function CanvasMenu(props: {
  /** Where it opens, in the canvas's own box. */
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly items: ReadonlyArray<CanvasMenuItem>;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return props.items.filter((item) =>
      words.every((word) => `${item.label} ${item.group}`.toLowerCase().includes(word)),
    );
  }, [props.items, query]);
  const pick = (item: CanvasMenuItem | undefined) => {
    if (item === undefined) return;
    props.onClose();
    item.onPick();
  };
  const groups = [...new Set(shown.map((item) => item.group))];

  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 z-20"
        onPointerDown={(event) => {
          event.stopPropagation();
          props.onClose();
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div
        role="dialog"
        aria-label={props.title}
        className="absolute z-30 flex max-h-96 w-64 flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        style={{ left: props.x, top: props.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="border-b border-border p-1.5">
          <Input
            size="sm"
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setAt(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setAt((before) => Math.min(shown.length - 1, before + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setAt((before) => Math.max(0, before - 1));
              } else if (event.key === "Enter") {
                pick(shown[at]);
              } else if (event.key === "Escape") {
                props.onClose();
              }
            }}
            placeholder={props.title}
            aria-label={props.title}
          />
        </div>
        <div role="listbox" aria-label={props.title} className="min-h-0 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing by that name.</p>
          ) : null}
          {groups.map((group) => (
            <div key={group} className="flex flex-col">
              <span className="px-2 pt-1.5 pb-0.5 text-2xs text-muted-foreground">{group}</span>
              {shown
                .filter((item) => item.group === group)
                .map((item) => {
                  const index = shown.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={index === at}
                      onPointerEnter={() => setAt(index)}
                      onClick={() => pick(item)}
                      className={cn(
                        "flex h-7 items-center gap-2 rounded-md px-2 text-left text-xs outline-none",
                        index === at ? "bg-accent text-accent-foreground" : "text-foreground",
                      )}
                    >
                      {Icon === undefined ? (
                        <span aria-hidden className="size-3.5 shrink-0" />
                      ) : (
                        <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.keys === undefined ? null : (
                        <span className="shrink-0 text-2xs text-muted-foreground">{item.keys}</span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
