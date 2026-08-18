// Passive hidden-file scanner: builds probe candidates relative to the current
// directory, runs them through the background probe pool, and renders the
// concept's scanner card (usable both inline in the explorer and standalone).
import type { RiskLevel, ScanPath } from "../../shared/types";
import { COLORS, hexA } from "../../shared/design";
import { probeAll, type ProbeResult } from "../../shared/checker";
import { t } from "../../shared/i18n";
import { el, icon } from "./dom";

export interface Secret {
  name: string; // display name / probe path value
  href: string;
  risk: RiskLevel;
  note: string;
  source: "hidden" | "listed";
  protectedOnly?: boolean; // 401/403 — exists but access denied
}

export interface Candidate {
  url: string;
  path: ScanPath;
}

/** Directory the current page lives in (probe base), e.g. http://h/a/b/. */
export function currentDir(): string {
  try {
    return new URL(".", location.href).href;
  } catch {
    return location.origin + "/";
  }
}

/** Resolve enabled scan paths against a base dir, skipping already-listed URLs. */
export function buildCandidates(baseUrl: string, paths: ScanPath[], skip: Set<string>): Candidate[] {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (!path.enabled || !path.value.trim()) continue;
    let url: string;
    try {
      url = new URL(path.value, base).href;
    } catch {
      continue;
    }
    if (skip.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, path });
  }
  return out;
}

/**
 * Probe candidates locally (same-origin fetch from the content script needs no
 * host permission). Returns a canceller.
 */
export function runProbe(
  urls: string[],
  concurrency: number,
  timeoutMs: number,
  onResult: (url: string, result: ProbeResult) => void,
  onDone: () => void
): { cancel: () => void } {
  const ctrl = new AbortController();
  probeAll(urls, concurrency, timeoutMs, onResult, ctrl.signal).then(onDone);
  return { cancel: () => ctrl.abort() };
}

export interface ScannerCardOpts {
  scanning: boolean;
  probed: { done: number; total: number };
  secrets: Secret[];
  open: boolean;
  accent: string;
  onToggle: () => void;
  onOpenSecret: (href: string) => void;
  onClose?: () => void; // when set, renders an X (standalone overlay)
}

/** The concept scanner card. */
export function scannerCard(o: ScannerCardOpts): HTMLElement {
  const border = "rgba(224,138,138,0.35)";
  const scanning = o.scanning;

  const iconEl = scanning
    ? icon("M21 12a9 9 0 1 1-6.2-8.5", { size: 17, strokeWidth: 1.8, stroke: o.accent })
    : icon("M12 2a7 7 0 0 0-7 7v2H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1V9a7 7 0 0 0-7-7z M12 15v2", { size: 17, strokeWidth: 1.7, stroke: "#e08a8a" });
  if (scanning) iconEl.classList.add("spin");

  const title = scanning ? t("scan_scanning") : t("scan_found_title", o.secrets.length);
  const sub = scanning
    ? t("scan_sub_scanning") + (o.probed.total ? ` · ${o.probed.done}/${o.probed.total}` : "")
    : t("scan_sub_done");

  const head = el("div", { style: { display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px" } },
    el("span", { style: { flex: "none", width: "34px", height: "34px", borderRadius: "9px", border: `1px solid ${scanning ? COLORS.border : border}`, background: scanning ? COLORS.panel3 : "rgba(224,138,138,0.1)", display: "flex", alignItems: "center", justifyContent: "center" } }, iconEl),
    el("div", { style: { display: "flex", flexDirection: "column", lineHeight: "1.35", minWidth: "0" } },
      el("span", { style: { fontSize: "13.5px", fontWeight: "600", color: COLORS.text } }, title),
      el("span", { style: { fontSize: "11.5px", color: COLORS.muted } }, sub)
    ),
    el("div", { style: { flex: "1" } }),
    !scanning && o.secrets.length
      ? el("button", { class: "hoverable hover-surface", style: btnStyle(), onClick: o.onToggle }, o.open ? t("scan_hide", o.secrets.length) : t("scan_show", o.secrets.length))
      : null,
    o.onClose
      ? el("button", { class: "hoverable hover-surface", style: { ...btnStyle(), width: "32px", height: "32px", padding: "0", justifyContent: "center" }, onClick: o.onClose }, icon("M18 6L6 18M6 6l12 12", { size: 15, strokeWidth: 2 }))
      : null
  );

  const wrap = el("div", { style: { border: `1px solid ${scanning ? COLORS.border : border}`, borderRadius: "14px", background: COLORS.panel, overflow: "hidden" } }, head);

  if (!scanning && o.open && o.secrets.length) {
    const body = el("div", { style: { borderTop: `1px solid ${COLORS.borderRow}` } });
    for (const s of o.secrets.slice(0, 100)) {
      // Simple row: just the file name (no descriptions).
      body.append(el("div", { style: { display: "flex", alignItems: "center", gap: "12px", padding: "11px 16px", borderBottom: "1px solid #141619" } },
        el("span", { style: { flex: "none", width: "28px", height: "28px", borderRadius: "7px", border: `1px solid ${COLORS.border2}`, background: COLORS.panel3, display: "flex", alignItems: "center", justifyContent: "center" } }, icon("M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 15h6", { size: 14, stroke: "#e08a8a" })),
        el("span", { class: "mono", style: { fontSize: "13px", color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: "0" } }, s.name),
        el("div", { style: { flex: "1" } }),
        s.protectedOnly ? tag("403", "#d6a878") : null,
        el("button", { class: "hoverable hover-bright", style: { border: "1px solid transparent", background: o.accent, color: COLORS.onAccent, fontSize: "12.5px", fontWeight: "600", padding: "7px 13px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }, onClick: () => o.onOpenSecret(s.href) },
          icon("M7 17L17 7 M9 7h8v8", { size: 13, strokeWidth: 2.2, stroke: COLORS.onAccent }), t("scan_open"))
      ));
    }
    wrap.append(body);
  }
  return wrap;
}

function tag(label: string, color: string): HTMLElement {
  return el("span", { style: { fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em", color, border: `1px solid ${hexA(color, 0.4)}`, background: hexA(color, 0.1), padding: "2px 6px", borderRadius: "5px" } }, label);
}

function btnStyle(): Record<string, string> {
  return { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", border: `1px solid ${COLORS.border2}`, background: "transparent", color: COLORS.textDim, fontSize: "12.5px", padding: "7px 12px", borderRadius: "8px" };
}
