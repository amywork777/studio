import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuItemDetail,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { EVERYTHING, EXPORT_CONTENTS, type ExportContent } from "./deliverables";

/**
 * The Overview's Export, the project's as a part's tab has its own: Everything (zip) first, with
 * what it holds as checkboxes, all on, then each kind alone. A kind the project has none of is
 * greyed. Each writes a zip in the project's `exports/` (`useDeliverables`).
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
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" sideOffset={6}>
        <MenuItem disabled={chosen.size === 0} onClick={() => props.onExport(chosen)}>
          Everything (zip)
        </MenuItem>
        {EXPORT_CONTENTS.map((item) => (
          <MenuCheckboxItem
            key={item.id}
            checked={chosen.has(item.id)}
            onCheckedChange={(on) => toggle(item.id, on)}
          >
            {item.label}
            {props.counts[item.id] === 0 ? <MenuItemDetail>none yet</MenuItemDetail> : null}
          </MenuCheckboxItem>
        ))}
        <MenuSeparator />
        {singles.map((item) => (
          <MenuItem
            key={item.id}
            disabled={props.counts[item.id] === 0}
            onClick={() => props.onExport(new Set([item.id]), item.label)}
          >
            {item.label} only
            <MenuItemDetail>{props.counts[item.id]}</MenuItemDetail>
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
