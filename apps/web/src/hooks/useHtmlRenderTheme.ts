import { HTML_RENDER_DEFAULT_FONTS, htmlRenderTheme } from "@t3tools/shared/htmlRender";
import { useSyncExternalStore } from "react";

import { appearanceFontStack } from "../appearanceFonts";
import {
  getStandardThemeColors,
  getThemeColorsForMode,
  getThemeDefinition,
  resolveThemeHalf,
  subscribeToCustomThemes,
  themeColorToHex,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeHalves,
  type ThemePreference,
} from "../themePalette";
import { useClientSettings } from "./useSettings";
import { useTheme } from "./useTheme";

/**
 * Studio's look as agent renders and the CAD viewer read it: `brand/theme.css`'s surfaces in hex, over
 * the stock palette, so a render with no theme of its own sits on the app's charcoal, not T3's black.
 */
const BRAND_COLORS = {
  light: {
    canvas: "#ffffff",
    surface: "#ffffff",
    surfaceOverlay: "#ffffff",
    muted: "#f5f5f5",
    secondary: "#f5f5f5",
    mutedForeground: "#737373",
    text: "#0a0a0a",
    border: "#e5e5e5",
    input: "#e5e5e5",
    focus: "#2c7197",
    messageAction: "#2c7197",
  },
  dark: {
    canvas: "#292929",
    surface: "#303030",
    surfaceOverlay: "#303030",
    muted: "#383838",
    secondary: "#383838",
    mutedForeground: "#adadad",
    text: "#fafafa",
    border: "#3d3d3d",
    input: "#494949",
    focus: "#62b7ec",
    messageAction: "#62b7ec",
  },
} as const;

const brandColors = new Map<ThemeAppearance, ThemeColors>();

/** The stock palette under Studio's brand, the same object each time for `useSyncExternalStore`. */
function getBrandThemeColors(appearance: ThemeAppearance): ThemeColors {
  const known = brandColors.get(appearance);
  if (known !== undefined) return known;
  const colors = { ...getStandardThemeColors(appearance), ...BRAND_COLORS[appearance] };
  brandColors.set(appearance, colors);
  return colors;
}

/** The palette `applyTheme` paints for a preference, or Studio's look when no theme applies. */
function resolveActiveThemeColors(
  theme: ThemePreference,
  halves: ThemeHalves | null,
  appearance: ThemeAppearance,
) {
  const definition = getThemeDefinition(resolveThemeHalf(theme, halves, appearance));
  return definition === null
    ? getBrandThemeColors(appearance)
    : (getThemeColorsForMode(definition, appearance) ?? definition.colors);
}

export function useHtmlRenderTheme() {
  const { theme, resolvedTheme, themeHalves } = useTheme();
  // Custom and published palettes can be edited in place, under an unchanged preference.
  const colors = useSyncExternalStore(
    subscribeToCustomThemes,
    () => resolveActiveThemeColors(theme, themeHalves, resolvedTheme),
    () => getBrandThemeColors(resolvedTheme),
  );
  const sans = useClientSettings((settings) => settings.fontFamilySans);
  const mono = useClientSettings((settings) => settings.fontFamilyCode);
  return htmlRenderTheme(
    Object.fromEntries(
      Object.entries(colors).map(([role, color]) => [role, themeColorToHex(color) ?? color]),
    ) as typeof colors,
    resolvedTheme,
    {
      sans: appearanceFontStack(sans, HTML_RENDER_DEFAULT_FONTS.sans),
      mono: appearanceFontStack(mono, HTML_RENDER_DEFAULT_FONTS.mono),
    },
  );
}
