// Design tokens ported from design/OpenDirectory.reference.html.
// Single source of truth for colors / typography used by the injected UI,
// the popup and the options page.
import type { RiskLevel } from "./types";

export const COLORS = {
  bg: "#0a0b0d",
  panel: "#0e1013",
  panel2: "#101215",
  panel3: "#121418",
  surface: "#15181c",
  rowHover: "#141619",
  hover: "#1e2126",

  text: "#e6e8ea",
  text2: "#cbd0d6",
  textDim: "#9aa1aa",
  muted: "#7a828c",
  faint: "#626973",
  placeholder: "#565d66",

  border: "#23262b",
  border2: "#2a2e34",
  border3: "#1e2126",
  borderRow: "#17191d",
  borderBar: "#2c3037",

  accentDefault: "#f2f4f6",
  onAccent: "#06181c",
} as const;

export const ACCENT_OPTIONS = ["#f2f4f6", "#6fc9d6", "#8a9bc4", "#c9b27f", "#84b39a"] as const;

export const FONT_SANS =
  'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
export const FONT_MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

/** Palette offered in the highlight-rule editor. */
export const RULE_PALETTE = ["#e08a8a", "#d6a878", "#84b39a", "#8a9bc4", "#b192b2"] as const;

/** Risk styling for the sensitive-file scanner card. */
export const RISK: Record<RiskLevel, { color: string; border: string; bg: string }> = {
  critical: { color: "#e08a8a", border: "rgba(224,138,138,0.4)", bg: "rgba(224,138,138,0.1)" },
  high: { color: "#d6a878", border: "rgba(214,168,120,0.4)", bg: "rgba(214,168,120,0.1)" },
  medium: { color: "#c9c07f", border: "rgba(201,192,127,0.35)", bg: "rgba(201,192,127,0.09)" },
};

export type { RiskLevel };

/** hex + alpha -> rgba() string. */
export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
