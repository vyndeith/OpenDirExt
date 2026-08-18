// Options page: highlight-rule editor + crawl / theme / export defaults.
import type { HighlightRule, MatchKind, HighlightAction, Settings, ExportFormat, FileCategory, ScanPath, RiskLevel } from "../shared/types";
import { COLORS, ACCENT_OPTIONS, RULE_PALETTE, hexA } from "../shared/design";
import { CATEGORY_TINT, ICON_PATHS, CATEGORY_ICON } from "../shared/icons";
import { styleFor } from "../shared/highlighter";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "../shared/storage";
import { t, setLang } from "../shared/i18n";
import { el, icon, clear } from "../content/ui/dom";

let settings: Settings;
const app = document.getElementById("app")!;
let previewName = ".env.production";

const KINDS: MatchKind[] = ["exact", "glob", "regex", "ext"];
const ACTIONS: HighlightAction[] = ["tint", "outline", "badge", "icon"];
const FORMATS: ExportFormat[] = ["aria2", "wget-i", "wget-r", "jdownloader", "rclone", "m3u8", "json", "csv", "txt", "zip"];
const kindLabels = (): Record<MatchKind, string> => ({ exact: t("kind_exact"), glob: t("kind_glob"), regex: t("kind_regex"), ext: t("kind_ext") });
const actionLabels = (): Record<HighlightAction, string> => ({ tint: t("act_tint"), outline: t("act_outline"), badge: t("act_badge"), icon: t("act_icon") });
const riskLabels = (): Record<RiskLevel, string> => ({ critical: t("risk_critical"), high: t("risk_high"), medium: t("risk_medium") });

async function persist(): Promise<void> {
  await saveSettings(settings);
}

function card(...children: (Node | string | false | null)[]): HTMLElement {
  return el("div", { style: { border: `1px solid ${COLORS.border}`, borderRadius: "14px", background: COLORS.panel, padding: "18px 20px", marginBottom: "16px" } }, ...children.filter(Boolean) as Node[]);
}

function sectionTitle(text: string, sub?: string): HTMLElement {
  return el("div", { style: { marginBottom: "14px" } },
    el("div", { style: { fontSize: "15px", fontWeight: "600", letterSpacing: "-0.01em" } }, text),
    sub ? el("div", { style: { fontSize: "12px", color: COLORS.muted, marginTop: "3px" } }, sub) : null
  );
}

function labeled(label: string, control: Node): HTMLElement {
  return el("label", { style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: COLORS.textDim } }, label, control as Node);
}

function input(value: string | number, onChange: (v: string) => void, opts: { type?: string; width?: string; mono?: boolean } = {}): HTMLInputElement {
  return el("input", {
    value: String(value), type: opts.type || "text", class: opts.mono ? "mono" : undefined,
    style: { border: `1px solid ${COLORS.border2}`, background: "#0b0d10", borderRadius: "8px", padding: "8px 11px", fontSize: "13px", width: opts.width || "100%", fontFamily: opts.mono ? "ui-monospace, Menlo, Consolas, monospace" : "inherit" },
    onChange: (e: Event) => onChange((e.target as HTMLInputElement).value),
  });
}

function select<T extends string>(value: T, options: readonly T[], labels: Record<T, string> | null, onChange: (v: T) => void): HTMLSelectElement {
  const s = el("select", { style: { border: `1px solid ${COLORS.border2}`, background: "#0b0d10", borderRadius: "8px", padding: "8px 10px", fontSize: "13px" }, onChange: (e: Event) => onChange((e.target as HTMLSelectElement).value as T) });
  for (const opt of options) {
    const o = el("option", { value: opt }, labels ? labels[opt] : opt);
    if (opt === value) o.selected = true;
    s.append(o);
  }
  return s;
}

function toggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const knob = el("span", { style: { position: "absolute", top: "2px", left: value ? "20px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: value ? COLORS.bg : COLORS.textDim, transition: "left .15s" } });
  return el("span", {
    style: { position: "relative", display: "inline-block", width: "38px", height: "20px", borderRadius: "12px", background: value ? settings.theme.accent : "#2a2e34", cursor: "pointer", transition: "background .15s" },
    onClick: () => onChange(!value),
  }, knob);
}

// ---------- rules ----------

function ruleCard(rule: HighlightRule, index: number): HTMLElement {
  const swatch = el("span", { style: { flex: "none", width: "24px", height: "24px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", background: hexA(rule.color, 0.14), border: `1px solid ${hexA(rule.color, 0.4)}` } }, el("span", { style: { width: "10px", height: "10px", borderRadius: "3px", background: rule.color } }));

  const valueInput = input(rule.value, (v) => { rule.value = v; void persist(); refreshPreview(); }, { mono: true });
  valueInput.placeholder = rule.kind === "ext" ? t("rule_ph_ext") : rule.kind === "regex" ? t("rule_ph_regex") : rule.kind === "glob" ? t("rule_ph_glob") : t("rule_ph_exact");

  const del = el("button", { style: { flex: "none", border: `1px solid ${COLORS.border2}`, background: "transparent", color: COLORS.muted, width: "34px", height: "34px", borderRadius: "8px", cursor: "pointer" }, onClick: () => { settings.rules.splice(index, 1); void persist(); render(); } }, icon("M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14", { size: 15, strokeWidth: 1.8 }));

  const enabled = toggle(rule.enabled, (v) => { rule.enabled = v; void persist(); render(); });

  const kindSel = select<MatchKind>(rule.kind, KINDS, kindLabels(), (v) => { rule.kind = v; void persist(); render(); });
  const actionSel = select<HighlightAction>(rule.action, ACTIONS, actionLabels(), (v) => { rule.action = v; void persist(); render(); });

  const palette = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
    ...[...RULE_PALETTE].map((c) => el("span", { style: { width: "20px", height: "20px", borderRadius: "6px", background: c, cursor: "pointer", border: `2px solid ${c === rule.color ? COLORS.text : "transparent"}` }, onClick: () => { rule.color = c; void persist(); render(); } })),
    input(rule.color, (v) => { rule.color = v; void persist(); refreshPreview(); }, { type: "color", width: "28px" })
  );

  const badgeRow = rule.action === "badge"
    ? labeled(t("opt_badge_label"), input(rule.badgeLabel || "flag", (v) => { rule.badgeLabel = v; void persist(); refreshPreview(); }, { width: "160px" }))
    : null;

  const order = el("div", { style: { display: "flex", gap: "4px" } },
    el("button", { style: miniBtn(), onClick: () => move(index, -1), title: t("opt_up") }, "↑"),
    el("button", { style: miniBtn(), onClick: () => move(index, 1), title: t("opt_down") }, "↓")
  );

  return el("div", { style: { border: `1px solid ${COLORS.border}`, borderRadius: "12px", background: "#101215", padding: "13px 14px", display: "flex", flexDirection: "column", gap: "12px", opacity: rule.enabled ? "1" : "0.55" } },
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, swatch, valueInput, order, del),
    el("div", { style: { display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" } },
      labeled(t("opt_match"), kindSel),
      labeled(t("opt_action"), actionSel),
      badgeRow,
      el("div", { style: { flex: "1" } }),
      labeled(t("opt_color"), palette),
      labeled(t("opt_on"), enabled)
    )
  );
}

function miniBtn(): Record<string, string> {
  return { border: `1px solid ${COLORS.border2}`, background: "transparent", color: COLORS.textDim, width: "28px", height: "28px", borderRadius: "7px", cursor: "pointer", fontSize: "13px" };
}

function move(index: number, dir: number): void {
  const j = index + dir;
  if (j < 0 || j >= settings.rules.length) return;
  const arr = settings.rules;
  [arr[index], arr[j]] = [arr[j], arr[index]];
  arr.forEach((r, i) => (r.priority = i));
  void persist();
  render();
}

function addRule(): void {
  settings.rules.push({ id: "r-" + Date.now().toString(36), enabled: true, kind: "glob", value: "", action: "tint", color: RULE_PALETTE[settings.rules.length % RULE_PALETTE.length], priority: settings.rules.length });
  void persist();
  render();
}

// ---------- preview ----------

let previewHost: HTMLElement | null = null;
function refreshPreview(): void {
  if (!previewHost) return;
  clear(previewHost);
  previewHost.append(previewChip());
}
function previewChip(): HTMLElement {
  const fake = { name: previewName, isDir: false, category: "config" as FileCategory } as never;
  const style = styleFor(fake, settings.rules);
  const row = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${COLORS.border2}`, background: style?.tint ? hexA(style.tint, 0.1) : "#0b0d10", boxShadow: style?.outline ? `inset 3px 0 0 ${style.outline}` : "none" } },
    icon(ICON_PATHS.config, { size: 16, stroke: style?.iconTint || CATEGORY_TINT.config }),
    el("span", { class: "mono", style: { fontSize: "13px" } }, previewName),
    el("div", { style: { flex: "1" } }),
    style?.badge ? el("span", { style: { fontSize: "10px", textTransform: "uppercase", color: style.badge.color, border: `1px solid ${hexA(style.badge.color, 0.4)}`, background: hexA(style.badge.color, 0.1), padding: "2px 6px", borderRadius: "5px" } }, style.badge.label) : null,
    !style ? el("span", { style: { fontSize: "11px", color: COLORS.faint } }, t("opt_no_match")) : null
  );
  return row;
}

// ---------- import / export ----------

function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}

function importJSON(onLoad: (data: unknown) => void): void {
  const inp = el("input", { type: "file", accept: "application/json", style: { display: "none" }, onChange: (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((txt) => { try { onLoad(JSON.parse(txt)); } catch { alert(t("opt_bad_json")); } });
  } });
  document.body.append(inp);
  inp.click();
  inp.remove();
}

function ghostBtn(label: string, onClick: () => void): HTMLElement {
  return el("button", { style: { border: `1px solid ${COLORS.border2}`, background: COLORS.surface, color: COLORS.textDim, borderRadius: "9px", padding: "8px 13px", fontSize: "12.5px", cursor: "pointer" }, onClick }, label);
}

// ---------- render ----------

function render(): void {
  clear(app);
  const wrap = el("div", { style: { maxWidth: "760px", margin: "0 auto" } });

  wrap.append(el("div", { style: { display: "flex", alignItems: "center", gap: "13px", marginBottom: "24px" } },
    el("span", { style: { width: "36px", height: "36px", borderRadius: "10px", border: `1px solid ${COLORS.border2}`, background: COLORS.surface, display: "flex", alignItems: "center", justifyContent: "center" } }, icon(ICON_PATHS.folder, { size: 19, stroke: settings.theme.accent })),
    el("div", {}, el("div", { style: { fontSize: "17px", fontWeight: "600" } }, "Open Directory Explorer"), el("div", { style: { fontSize: "12px", color: COLORS.muted } }, t("modal_title")))
  ));

  // Rules
  const rulesCard = card(sectionTitle(t("rules_section"), t("opt_rules_hint")));
  const rulesList = el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
  settings.rules.forEach((r, i) => rulesList.append(ruleCard(r, i)));
  rulesCard.append(rulesList);
  rulesCard.append(el("button", { style: { marginTop: "12px", width: "100%", border: "1px dashed #2e3339", background: "transparent", color: COLORS.textDim, fontSize: "13px", padding: "11px", borderRadius: "10px", cursor: "pointer" }, onClick: addRule }, t("opt_add_rule")));

  previewHost = el("div", { style: { marginTop: "14px" } }, previewChip());
  rulesCard.append(el("div", { style: { marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" } },
    labeled(t("opt_preview"), input(previewName, (v) => { previewName = v; refreshPreview(); }, { mono: true })),
    previewHost
  ));
  rulesCard.append(el("div", { style: { display: "flex", gap: "8px", marginTop: "14px" } },
    ghostBtn(t("opt_export_rules"), () => downloadJSON("ode-rules.json", settings.rules)),
    ghostBtn(t("opt_import_rules"), () => importJSON((data) => { if (Array.isArray(data)) { settings.rules = data as HighlightRule[]; void persist(); render(); } }))
  ));
  wrap.append(rulesCard);

  // Crawl defaults
  const c = settings.crawl;
  wrap.append(card(sectionTitle(t("opt_crawl_defaults")),
    el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" } },
      labeled(t("opt_depth"), input(c.depth, (v) => { c.depth = clampInt(v, 0, 999); void persist(); }, { type: "number" })),
      labeled(t("opt_concurrency"), input(c.concurrency, (v) => { c.concurrency = clampInt(v, 1, 32); void persist(); }, { type: "number" })),
      labeled(t("opt_throttle"), input(c.throttleMs, (v) => { c.throttleMs = clampInt(v, 0, 5000); void persist(); }, { type: "number" })),
      labeled(t("opt_timeout"), input(c.timeoutMs, (v) => { c.timeoutMs = clampInt(v, 1000, 120000); void persist(); }, { type: "number" }))
    ),
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "14px" } }, toggle(c.checkLinks, (v) => { c.checkLinks = v; void persist(); render(); }), el("span", { style: { fontSize: "13px", color: COLORS.text2 } }, t("opt_check_links"))),
    el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "12px", flexWrap: "wrap" } },
      toggle(c.probePerDir, (v) => { c.probePerDir = v; void persist(); render(); }),
      el("span", { style: { fontSize: "13px", color: COLORS.text2 } }, t("opt_probe_per_dir")),
      el("span", { style: { flex: "1" } }),
      labeled(t("opt_probe_max"), input(c.probePerDirMax, (v) => { c.probePerDirMax = clampInt(v, 1, 10); void persist(); }, { type: "number", width: "90px" }))
    )
  ));

  // Passive scanner
  wrap.append(scannerSection());

  // Theme
  const th = settings.theme;
  const accents = el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
    ...[...ACCENT_OPTIONS].map((cc) => el("span", { style: { width: "26px", height: "26px", borderRadius: "8px", background: cc, cursor: "pointer", border: `2px solid ${cc === th.accent ? COLORS.text : "transparent"}` }, onClick: () => { th.accent = cc; void persist(); render(); } })),
    input(th.accent, (v) => { th.accent = v; void persist(); render(); }, { type: "color", width: "30px" })
  );
  wrap.append(card(sectionTitle(t("opt_theme")),
    el("div", { style: { display: "flex", flexWrap: "wrap", gap: "18px", alignItems: "flex-end" } },
      labeled(t("opt_lang"), select(settings.lang, ["auto", "en", "ru"] as const, { auto: t("lang_auto"), en: "English", ru: "Русский" }, (v) => { settings.lang = v; setLang(v); void persist(); render(); })),
      labeled(t("opt_accent"), accents),
      labeled(t("opt_density"), select(th.density, ["comfortable", "compact"] as const, { comfortable: t("opt_comfortable"), compact: t("opt_compact") }, (v) => { th.density = v; void persist(); })),
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, toggle(th.showFileIcons, (v) => { th.showFileIcons = v; void persist(); }), el("span", { style: { fontSize: "13px", color: COLORS.text2 } }, t("opt_file_icons")))
    ),
    iconMapEditor()
  ));

  // Export defaults
  const ex = settings.export;
  wrap.append(card(sectionTitle(t("opt_export_defaults")),
    el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px" } },
      labeled(t("opt_format"), select(ex.defaultFormat, FORMATS, null, (v) => { ex.defaultFormat = v; void persist(); })),
      labeled(t("opt_zip_mb"), input(Math.round(ex.zipWarnBytes / 1048576), (v) => { ex.zipWarnBytes = clampInt(v, 1, 1000000) * 1048576; void persist(); }, { type: "number" })),
      labeled(t("opt_zip_files"), input(ex.zipWarnCount, (v) => { ex.zipWarnCount = clampInt(v, 1, 1000000); void persist(); }, { type: "number" }))
    )
  ));

  // Global import/export/reset
  wrap.append(card(sectionTitle(t("opt_all_settings")),
    el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
      ghostBtn(t("opt_export_settings"), () => downloadJSON("ode-settings.json", settings)),
      ghostBtn(t("opt_import_settings"), () => importJSON((data) => { settings = { ...DEFAULT_SETTINGS, ...(data as Settings) }; void persist(); render(); })),
      ghostBtn(t("opt_reset"), () => { if (confirm(t("opt_reset_confirm"))) { settings = structuredClone(DEFAULT_SETTINGS); void persist(); render(); } })
    )
  ));

  app.append(wrap);
}

const RISKS: RiskLevel[] = ["critical", "high", "medium"];

function scanPathRow(p: ScanPath, index: number): HTMLElement {
  const en = toggle(p.enabled, (v) => { p.enabled = v; void persist(); render(); });
  const value = input(p.value, (v) => { p.value = v; void persist(); }, { mono: true, width: "180px" });
  value.placeholder = t("opt_scan_ph");
  const risk = select<RiskLevel>(p.risk, RISKS, riskLabels(), (v) => { p.risk = v; void persist(); });
  const note = input(p.note, (v) => { p.note = v; void persist(); });
  const del = el("button", { style: { flex: "none", border: `1px solid ${COLORS.border2}`, background: "transparent", color: COLORS.muted, width: "34px", height: "34px", borderRadius: "8px", cursor: "pointer" }, onClick: () => { settings.scanner.paths.splice(index, 1); void persist(); render(); } }, icon("M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14", { size: 15, strokeWidth: 1.8 }));
  return el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: "10px", background: "#101215", opacity: p.enabled ? "1" : "0.55" } },
    en, value, risk, el("div", { style: { flex: "1", minWidth: "120px" } }, note), del
  );
}

function scannerSection(): HTMLElement {
  const s = settings.scanner;
  const list = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" } });
  s.paths.forEach((p, i) => list.append(scanPathRow(p, i)));
  return card(
    sectionTitle(t("opt_scanner_title"), t("opt_scanner_hint")),
    el("div", { style: { display: "flex", flexWrap: "wrap", gap: "18px", alignItems: "flex-end" } },
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, toggle(s.enabled, (v) => { s.enabled = v; void persist(); render(); }), el("span", { style: { fontSize: "13px", color: COLORS.text2 } }, t("opt_scanner_enable"))),
      labeled(t("opt_concurrency"), input(s.concurrency, (v) => { s.concurrency = clampInt(v, 1, 16); void persist(); }, { type: "number", width: "90px" })),
      labeled(t("opt_timeout"), input(s.timeoutMs, (v) => { s.timeoutMs = clampInt(v, 1000, 60000); void persist(); }, { type: "number", width: "110px" }))
    ),
    list,
    el("button", { style: { marginTop: "12px", width: "100%", border: "1px dashed #2e3339", background: "transparent", color: COLORS.textDim, fontSize: "13px", padding: "11px", borderRadius: "10px", cursor: "pointer" }, onClick: () => { settings.scanner.paths.push({ value: "", risk: "high", note: "", enabled: true }); void persist(); render(); } }, t("opt_add_path"))
  );
}

function iconMapEditor(): HTMLElement {
  const cats = Object.keys(CATEGORY_ICON) as FileCategory[];
  const iconKeys = Object.keys(ICON_PATHS);
  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginTop: "14px" } });
  for (const cat of cats) {
    const current = settings.categoryIcons[cat] || CATEGORY_ICON[cat];
    grid.append(el("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: COLORS.textDim } },
      icon(ICON_PATHS[current] || ICON_PATHS.unknown, { size: 15, stroke: CATEGORY_TINT[cat] }),
      cat,
      select(current, iconKeys, null, (v) => { settings.categoryIcons[cat] = v; void persist(); render(); })
    ));
  }
  return el("div", {}, el("div", { style: { fontSize: "12px", color: COLORS.muted, marginTop: "16px", marginBottom: "2px" } }, t("opt_cat_icons")), grid);
}

function clampInt(v: string, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function main(): Promise<void> {
  settings = await getSettings();
  setLang(settings.lang);
  render();
}

void main();
