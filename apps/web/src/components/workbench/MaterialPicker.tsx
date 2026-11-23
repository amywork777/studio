import { CheckIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { filterMaterials, MATERIAL_LIBRARY } from "./materials";

const rowClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-foreground outline-none hover:bg-accent/50 focus-visible:bg-accent";

/**
 * A material from the library, the way a CAD tool assigns one: search the
 * families, pick a grade, or type any other name and use it as written.
 */
export function MaterialPicker(props: {
  readonly value: string;
  readonly onChange: (material: string) => void;
  /** The button that opens it, showing the material. */
  readonly trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const groups = filterMaterials(query);
  const typed = query.trim();
  const known = MATERIAL_LIBRARY.flatMap(({ materials }) => materials).find(
    (material) => material.toLowerCase() === typed.toLowerCase(),
  );

  const choose = (material: string) => {
    props.onChange(material);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger render={props.trigger} />
      <PopoverPopup width="sm" padding="compact" align="start" initialFocus={input}>
        <Input
          ref={input}
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || typed === "") return;
            event.preventDefault();
            choose(known ?? typed);
          }}
          placeholder="Search, or type any material"
          aria-label="Material"
        />
        <div className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto">
          {typed === "" || known !== undefined ? null : (
            <button type="button" className={rowClass} onClick={() => choose(typed)}>
              Use “{typed}”
            </button>
          )}
          {groups.map(({ family, materials }) => (
            <div key={family} role="group" aria-label={family} className="flex flex-col">
              <div className="px-2 pb-0.5 text-xs font-medium text-muted-foreground">{family}</div>
              {materials.map((material) => {
                const current = material === props.value;
                return (
                  <button
                    key={material}
                    type="button"
                    aria-pressed={current}
                    className={cn(rowClass, current && "font-medium")}
                    onClick={() => choose(material)}
                  >
                    <span className="min-w-0 flex-1 truncate">{material}</span>
                    {current ? (
                      <CheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
          {props.value === "" ? null : (
            <button
              type="button"
              className={cn(rowClass, "text-muted-foreground")}
              onClick={() => choose("")}
            >
              Clear the material
            </button>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
