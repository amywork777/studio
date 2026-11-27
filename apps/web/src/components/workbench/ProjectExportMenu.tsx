import { ChevronDownIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemDetail,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { EVERYTHING, EXPORT_CONTENTS, type ExportContent } from "./deliverables";

/**
 * The Overview's Export, the project's as a part's tab has its own, in two groups: Everything, what
 * its zip holds as checkboxes (all on) over its Export button, then One kind, each alone. Every row
 * ends in how many files the project has of it, and a kind with none is greyed. Each writes a zip
 * in the project's `exports/` (`useDeliverables`).
 */
export function ProjectExportMenu(props: {
  /** How many files of each kind the project has (`exportCounts`). */
  readonly counts: Readonly<Record<ExportContent, number>>;
  /** An export is being written. */
  readonly busy: boolean;
  readonly onExport: (include: ReadonlySet<ExportContent>, label?: string) => void;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<ExportContent>>(EVERYTHING);
  const toggle = (id: ExportContent, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  };
  // The receipt alone exports nothing to check it against, so it never goes alone.
  const singles = EXPORT_CONTENTS.filter((item) => item.id !== "receipt");
  const files = [...chosen].reduce(
    (total, id) => total + (id === "receipt" ? 1 : props.counts[id]),
    0,
  );
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="xs"
            variant="outline"
            disabled={props.busy}
            aria-busy={props.busy || undefined}
          />
        }
      >
        <DownloadIcon />
        {props.busy ? "Exporting…" : "Export"}
        <ChevronDownIcon />
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" sideOffset={6}>
        <MenuGroup>
          <MenuGroupLabel>Everything, as one zip</MenuGroupLabel>
          {EXPORT_CONTENTS.map((item) => (
            <MenuCheckboxItem
              key={item.id}
              checked={chosen.has(item.id)}
              onCheckedChange={(on) => toggle(item.id, on)}
            >
              <span className="-me-2 flex items-center">
                {item.label}
                <MenuItemDetail>
                  {item.id === "receipt" ? "1" : props.counts[item.id]}
                </MenuItemDetail>
              </span>
            </MenuCheckboxItem>
          ))}
          <MenuItem disabled={files === 0} onClick={() => props.onExport(chosen)}>
            <DownloadIcon />
            Export zip
            <MenuItemDetail>{files === 1 ? "1 file" : `${files} files`}</MenuItemDetail>
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>One kind, as its own zip</MenuGroupLabel>
          {singles.map((item) => (
            <MenuItem
              key={item.id}
              disabled={props.counts[item.id] === 0}
              onClick={() => props.onExport(new Set([item.id]), item.label)}
            >
              {item.label}
              <MenuItemDetail>{props.counts[item.id]}</MenuItemDetail>
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
