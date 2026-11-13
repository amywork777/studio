import { msg, useMessages } from "gt-react";

import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { SETTINGS_SECTION_LABELS } from "./settingsSearch";
import { settingsSectionLabel, useEngineeringInterface } from "../workbench/studioInterface";

const SETTINGS_LABEL = msg("Settings");

const SETTINGS_BREADCRUMB_LABELS: Readonly<Record<string, string>> = {
  ...SETTINGS_SECTION_LABELS,
  "/settings/diagnostics": msg("Diagnostics"),
  "/settings/open-source-licenses": msg("Open source licenses"),
};

function settingsBreadcrumbLabel(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_BREADCRUMB_LABELS[normalizedPathname] ?? null;
}

/** A settings page's name, as its breadcrumb and its title say it; null for an unnamed page. */
export function useSettingsPageLabel(pathname: string): string | null {
  const m = useMessages();
  const engineering = useEngineeringInterface();
  const label = settingsBreadcrumbLabel(pathname);
  return label === null
    ? null
    : settingsSectionLabel(pathname.replace(/\/+$/, ""), m(label), engineering);
}

/**
 * `Settings`, for an unnamed page: a named one says its name once, in its title
 * (`SettingsPageContainer`) and on the rail. The scope a change applies to
 * lives at the top of the page content, see `SettingsScopeSentence`.
 */
export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const m = useMessages();
  const sectionLabel = useSettingsPageLabel(pathname);
  if (sectionLabel !== null) return null;

  return (
    <WorkspaceBreadcrumb ariaLabel="Settings breadcrumb">
      <WorkspaceBreadcrumbItem current className="truncate">
        {m(SETTINGS_LABEL)}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
