// The injected explorer UI. Vanilla DOM, styled from the shared design tokens.
import type { DirEntry, LinkStatus, RiskLevel, Settings, HighlightRule, MatchKind, HighlightAction, ScanPath } from "../../shared/types";
import { COLORS, hexA, RULE_PALETTE } from "../../shared/design";
import { CATEGORY_TINT, ICON_PATHS, CATEGORY_ICON } from "../../shared/icons";
import { fmtSize, fmtDate } from "../../shared/format";
import { styleFor } from "../../shared/highlighter";
import { relPath, evaluateZipGuard } from "../../shared/exporter";
import { getSettings, saveSettings, onSettingsChanged } from "../../shared/storage";
import { t, setLang } from "../../shared/i18n";
import { cacheKey, getTree, putTree, deleteTree } from "../../shared/db";
import { sendBg } from "../../shared/messages";
import { startCrawl, type CrawlProgress, type CrawlHandle } from "../../shared/crawler";
import { checkLinks, type ProbeResult } from "../../shared/checker";
import { el, icon, clear } from "./dom";
import { buildCandidates, currentDir, runProbe, scannerCard, type Secret } from "./scanner";

type SortKey = "name" | "modified" | "size" | "type";
type ListFormat = "aria2" | "wget-i" | "wget-r" | "jdownloader" | "rclone" | "m3u8" | "json" | "csv" | "txt";

const VIRTUAL_THRESHOLD = 400;

// Sensitive files that are *visible in the listing* (complements the probe).
const SENSITIVE: { re: RegExp; risk: RiskLevel; noteKey: string }[] = [
  { re: /^\.env(\..+)?$/i, risk: "critical", noteKey: "sens_env" },
  { re: /^(id_rsa|id_ed25519|\.htpasswd|\.npmrc|\.pgpass|\.aws)$/i, risk: "critical", noteKey: "sens_key" },
  { re: /^(wp-config|config|settings|secrets)\.(php|json|ya?ml|yml|ini|py|rb)$/i, risk: "high", noteKey: "sens_config" },
  { re: /\.(sql|dump|bak|old|swp)$/i, risk: "high", noteKey: "sens_dump" },
  { re: /^\.git/i, risk: "medium", noteKey: "sens_git" },
];

export class App {
  private root: HTMLElement;
  private settings!: Settings;
  private entries: DirEntry[];
  private readonly rootEntries: DirEntry[]; // just the opened directory, for reset
  private readonly rootUrl = location.href;
  private readonly serverLabel: string;
  private readonly pathLabel: string;

  private query = "";
  private sortKey: SortKey = "name";
  private sortDir: 1 | -1 = 1;
  private selected = new Set<string>();
  private statuses = new Map<string, LinkStatus>();
  private crawl: { running: boolean; paused: boolean; progress?: CrawlProgress; depth: number } = {
    running: false,
    paused: false,
    depth: 1,
  };
  private crawlHandle: CrawlHandle | null = null;
  private scanOpen = true;
  private scanning = false;
  private probed = { done: 0, total: 0 };
  private probedSecrets: Secret[] = [];
  private toast?: { title: string; text: string };
  private toastTimer?: number;
  private menuOpen = false;
  private settingsOpen = false;

  constructor(root: HTMLElement, entries: DirEntry[], server: string, path: string) {
    this.root = root;
    this.entries = entries;
    this.rootEntries = [...entries];
    this.serverLabel = server;
    this.pathLabel = path || "/";
  }

  async init(): Promise<void> {
    this.settings = await getSettings();
    setLang(this.settings.lang);
    this.crawl.depth = this.settings.crawl.depth;
    onSettingsChanged((s) => {
      this.settings = s;
      setLang(s.lang);
      this.render();
    });
    // Instant re-entry from cache.
    const cached = await getTree(cacheKey(location.origin, location.pathname));
    if (cached && cached.entries.length) {
      this.entries = cached.entries;
      this.fireToast(t("toast_cache_title"), t("toast_cache_sub", cached.entries.length));
    }
    this.render();
    if (this.settings.scanner.enabled) this.runScanner();
  }

  // ---------- passive hidden-file scanner ----------

  private runScanner(): void {
    const skip = new Set(this.entries.map((e) => e.href));
    const candidates = buildCandidates(currentDir(), this.settings.scanner.paths, skip);
    if (!candidates.length) return;
    const byUrl = new Map(candidates.map((c) => [c.url, c.path]));
    this.probedSecrets = [];
    this.probed = { done: 0, total: candidates.length };
    this.scanning = true;
    this.render();

    const onResult = (url: string, result: ProbeResult) => {
      this.probed.done++;
      if (result === "found" || result === "protected") {
        const p = byUrl.get(url);
        if (p) this.probedSecrets.push({ name: p.value, href: url, risk: p.risk, note: p.note, source: "hidden", protectedOnly: result === "protected" });
      }
      this.render();
    };
    const onDone = () => {
      this.scanning = false;
      const n = this.probedSecrets.length;
      if (n) this.fireToast(t("toast_hidden_found", n), t("toast_hidden_found_sub"));
      this.render();
    };
    runProbe(candidates.map((c) => c.url), this.settings.scanner.concurrency, this.settings.scanner.timeoutMs, onResult, onDone);
  }

  // ---------- data helpers ----------

  private visible(): DirEntry[] {
    const q = this.query.trim().toLowerCase();
    let list = this.entries.filter((e) => !q || e.name.toLowerCase().includes(q));
    const dir = this.sortDir;
    list = [...list].sort((a, b) => {
      const ad = a.isDir ? 0 : 1;
      const bd = b.isDir ? 0 : 1;
      if (ad !== bd) return ad - bd;
      let av: string | number;
      let bv: string | number;
      switch (this.sortKey) {
        case "size": av = a.size ?? -1; bv = b.size ?? -1; break;
        case "modified": av = a.modifiedTs ?? 0; bv = b.modifiedTs ?? 0; break;
        case "type": av = a.category; bv = b.category; break;
        default: av = a.name.toLowerCase(); bv = b.name.toLowerCase();
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
    return list;
  }

  private selectedEntries(): DirEntry[] {
    return this.entries.filter((e) => this.selected.has(e.href) && !e.isDir);
  }

  private secrets(): Secret[] {
    const byHref = new Map<string, Secret>();
    // 1) Probe-discovered hidden files (current dir).
    for (const s of this.probedSecrets) byHref.set(s.href, s);
    // 2) Hidden files discovered per-directory during crawl.
    for (const e of this.entries) {
      if (!e.hidden || byHref.has(e.href)) continue;
      const base = e.name.split("/").pop() || e.name;
      const p = this.settings.scanner.paths.find((sp) => sp.value === e.name || sp.value.endsWith(base));
      byHref.set(e.href, { name: e.name, href: e.href, risk: p?.risk ?? "medium", note: p?.note || t("hidden_note_fallback"), source: "hidden" });
    }
    // 3) Sensitive files that are actually listed.
    for (const e of this.entries) {
      if (e.isDir || e.hidden || byHref.has(e.href)) continue;
      const hit = SENSITIVE.find((s) => s.re.test(e.name));
      if (hit) byHref.set(e.href, { name: e.name, href: e.href, risk: hit.risk, note: t(hit.noteKey), source: "listed" });
    }
    const order: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2 };
    return [...byHref.values()].sort((a, b) => order[a.risk] - order[b.risk]);
  }

  private rowHeight(): number {
    return this.settings.theme.density === "compact" ? 45 : 57;
  }

  // ---------- state mutators ----------

  private toggleSel(href: string): void {
    if (this.selected.has(href)) this.selected.delete(href);
    else this.selected.add(href);
    this.render();
  }

  /** Open a folder (navigate) or a file (new tab). */
  private openEntry(e: DirEntry): void {
    if (e.isDir) location.href = e.href;
    else window.open(e.href, "_blank");
  }

  /** Path of the directory that contains `entry`, relative to the opened root. */
  private locationOf(entry: DirEntry): string {
    try {
      const root = new URL(this.rootUrl);
      let base = decodeURIComponent(root.pathname);
      if (!base.endsWith("/")) base += "/";
      let p = decodeURIComponent(new URL(entry.parentHref).pathname);
      p = p.startsWith(base) ? p.slice(base.length) : p.replace(/^\/+/, "");
      return p.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  private setSort(key: SortKey): void {
    if (this.sortKey === key) this.sortDir = (this.sortDir * -1) as 1 | -1;
    else { this.sortKey = key; this.sortDir = 1; }
    this.render();
  }

  private selectAllVisible(): void {
    const vis = this.visible().filter((e) => !e.isDir);
    const all = vis.length > 0 && vis.every((e) => this.selected.has(e.href));
    if (all) vis.forEach((e) => this.selected.delete(e.href));
    else vis.forEach((e) => this.selected.add(e.href));
    this.render();
  }

  private fireToast(title: string, text: string): void {
    this.toast = { title, text };
    this.render();
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast = undefined; this.render(); }, 3800);
  }

  // ---------- crawl ----------

  // Crawl runs in the content script (same-origin fetch → no host permission).
  private startCrawl(forceRefresh = false): void {
    if (this.crawl.running) return;
    if (forceRefresh) void deleteTree(cacheKey(location.origin, location.pathname));
    this.crawl.running = true;
    this.crawl.paused = false;
    this.crawl.progress = undefined;
    const merged = new Map<string, DirEntry>(this.entries.map((e) => [e.href, e]));

    const probePaths = this.settings.crawl.probePerDir
      ? this.settings.scanner.paths.filter((p) => p.enabled).map((p) => p.value)
      : undefined;
    const opts = { ...this.settings.crawl, depth: this.crawl.depth, probePaths };

    const handle = startCrawl(
      this.rootUrl,
      opts,
      (progress) => { this.crawl.progress = progress; this.render(); },
      (batch) => { for (const e of batch) merged.set(e.href, e); }
    );
    this.crawlHandle = handle;
    handle.promise
      .then((entries) => {
        for (const e of entries) merged.set(e.href, e);
        this.entries = [...merged.values()];
        this.crawl.running = false;
        this.crawlHandle = null;
        void putTree({
          key: cacheKey(location.origin, location.pathname),
          server: this.serverLabel as never,
          createdAt: Date.now(),
          depth: this.crawl.depth,
          entries: this.entries,
        });
        this.fireToast(t("toast_crawl_done"), t("toast_crawl_done_sub", this.entries.length));
        if (this.settings.crawl.checkLinks) this.checkAll(false);
      })
      .catch((e) => {
        this.crawl.running = false;
        this.crawlHandle = null;
        this.fireToast(t("toast_crawl_err"), (e as Error).message);
        this.render();
      });
    this.render();
  }

  /** True when the view contains anything beyond the opened directory. */
  private hasCrawlData(): boolean {
    return this.entries.length > this.rootEntries.length || this.entries.some((e) => e.depth > 0 || e.hidden);
  }

  /** Drop crawled/probed results and show only the current directory again. */
  private resetCrawl(): void {
    this.entries = [...this.rootEntries];
    this.statuses.clear();
    this.selected.clear();
    void deleteTree(cacheKey(location.origin, location.pathname));
    this.fireToast(t("toast_reset"), t("toast_reset_sub", this.entries.length));
  }

  private crawlControl(kind: "pause" | "resume" | "cancel"): void {
    if (kind === "pause") { this.crawlHandle?.pause(); this.crawl.paused = true; }
    else if (kind === "resume") { this.crawlHandle?.resume(); this.crawl.paused = false; }
    else if (kind === "cancel") { this.crawlHandle?.cancel(); this.crawl.running = false; this.crawlHandle = null; }
    this.render();
  }

  // ---------- link check ----------

  private checkAll(onlyVisible: boolean): void {
    const list = (onlyVisible ? this.visible() : this.entries).filter((e) => !e.isDir);
    if (!list.length) return;
    const ctrl = new AbortController();
    void checkLinks(
      list.map((e) => e.href),
      this.settings.crawl.concurrency,
      this.settings.crawl.timeoutMs,
      (url, status) => { this.statuses.set(url, status); this.render(); },
      ctrl.signal
    );
    this.fireToast(t("toast_check"), t("toast_check_sub", list.length));
  }

  // ---------- export / download ----------

  private async doDownloadStructure(): Promise<void> {
    const files = this.selectedEntries();
    if (!files.length) return;
    const items = files.map((e) => ({ url: e.href, filename: relPath(e, this.rootUrl) }));
    const res = await sendBg({ type: "download", items });
    this.fireToast(res.ok ? t("toast_dl_started") : t("toast_error"), res.ok ? t("toast_files_n", items.length) : (res as { error: string }).error);
  }

  private async doExportList(format: ListFormat): Promise<void> {
    const files = this.selectedEntries().length ? this.selectedEntries() : this.entries;
    const res = await sendBg({ type: "export:list", format, entries: files, rootUrl: this.rootUrl });
    this.fireToast(res.ok ? t("toast_list_saved") : t("toast_error"), res.ok ? (res as { note?: string }).note ?? "" : (res as { error: string }).error);
  }

  private async doZip(): Promise<void> {
    const files = this.selectedEntries();
    if (!files.length) return;
    const guard = evaluateZipGuard(files, this.settings.export.zipWarnBytes, this.settings.export.zipWarnCount);
    if (guard.exceeds) {
      const ok = confirm(t("zip_confirm", guard.count, fmtSize(guard.totalBytes)));
      if (!ok) return;
    }
    this.fireToast(t("toast_zip_building"), t("toast_zip_building_sub", files.length));
    const res = await sendBg({ type: "export:zip", entries: files, rootUrl: this.rootUrl, warnBytes: this.settings.export.zipWarnBytes, warnCount: this.settings.export.zipWarnCount });
    this.fireToast(res.ok ? t("toast_zip_ready") : t("toast_zip_err"), res.ok ? (res as { note?: string }).note ?? "" : (res as { error: string }).error);
  }

  private async copyLinks(): Promise<void> {
    const files = this.selectedEntries();
    const text = files.map((e) => e.href).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      this.fireToast(t("toast_copied"), t("toast_copied_sub", files.length));
    } catch {
      this.fireToast(t("toast_copy_fail"), t("toast_copy_fail_sub"));
    }
  }

  private async openInTabs(): Promise<void> {
    const files = this.selectedEntries();
    const res = await sendBg({ type: "openTabs", urls: files.map((e) => e.href) });
    this.fireToast(res.ok ? t("toast_opened_tabs") : t("toast_error"), res.ok ? (res as { note?: string }).note ?? "" : (res as { error: string }).error);
  }

  private accent(): string {
    return this.settings.theme.accent;
  }

  // ---------- render ----------

  render(): void {
    const accent = this.accent();
    clear(this.root);
    const page = el("div", { style: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "48px 20px 140px" } });
    const col = el("div", { style: { width: "100%", maxWidth: "900px" } });
    page.append(col);

    col.append(this.renderHeader(accent));
    col.append(this.renderToolbar(accent));
    col.append(this.renderCrawlBar(accent));
    const scan = this.renderScanner(accent);
    if (scan) col.append(scan);
    col.append(this.renderTableHead(accent));
    col.append(this.renderRows(accent));
    col.append(this.renderFooter());

    this.root.append(page);
    if (this.selected.size) this.root.append(this.renderSelectionBar(accent));
    if (this.settingsOpen) this.root.append(this.renderSettingsModal());
    if (this.toast) this.root.append(this.renderToast());
  }

  private btn(label: string | Node, onClick: () => void, extra?: Record<string, string>, cls = "hover-surface"): HTMLElement {
    return el(
      "button",
      {
        class: "hoverable " + cls,
        onClick,
        style: {
          display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
          border: `1px solid ${COLORS.border2}`, background: COLORS.surface, color: COLORS.textDim,
          fontSize: "12.5px", padding: "8px 13px", borderRadius: "9px", ...extra,
        },
      },
      label
    );
  }

  private renderHeader(accent: string): HTMLElement {
    const logo = el("div", { style: { width: "36px", height: "36px", borderRadius: "10px", border: `1px solid ${COLORS.border2}`, background: COLORS.surface, display: "flex", alignItems: "center", justifyContent: "center" } }, icon(ICON_PATHS.folder, { size: 19, stroke: accent }));
    const titles = el("div", { style: { display: "flex", flexDirection: "column", lineHeight: "1.3" } },
      el("span", { style: { fontSize: "15px", fontWeight: "600", letterSpacing: "-0.01em" } }, `Index of ${this.pathLabel}`),
      el("span", { class: "mono", style: { fontSize: "11.5px", color: COLORS.faint } }, location.host)
    );
    const settingsBtn = this.btn(
      el("span", { style: { display: "flex", alignItems: "center", gap: "8px" } }, icon("M12 5v14M5 12h14", { size: 15, strokeWidth: 1.7, stroke: "currentColor" }), t("rules")),
      () => { this.settingsOpen = true; this.render(); }
    );
    return el("div", { style: { display: "flex", alignItems: "center", gap: "13px", padding: "0 4px 20px" } }, logo, titles, el("div", { style: { flex: "1" } }), settingsBtn);
  }

  private renderToolbar(accent: string): HTMLElement {
    const crumbs = el("div", { style: { display: "flex", alignItems: "center", gap: "3px", fontSize: "13px", overflow: "hidden" } });
    const parts = this.pathLabel.split("/").filter(Boolean);
    const mk = (label: string, href: string, color: string) =>
      el("a", { href, class: "hoverable hover-surface", style: { color, cursor: "pointer", padding: "3px 6px", borderRadius: "7px", whiteSpace: "nowrap" } }, label);
    crumbs.append(mk("root", location.origin + "/", accent));
    let acc = "";
    parts.forEach((p, i) => {
      acc += "/" + p;
      crumbs.append(el("span", { style: { color: "#40454c", padding: "0 2px" } }, "/"));
      crumbs.append(mk(p, location.origin + acc + "/", i === parts.length - 1 ? COLORS.text2 : COLORS.textDim));
    });

    const search = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "7px 11px", border: `1px solid ${COLORS.border2}`, borderRadius: "9px", background: "#101215", minWidth: "180px" } },
      icon("M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-4.3-4.3", { size: 15, strokeWidth: 1.8, stroke: COLORS.faint }),
      el("input", { value: this.query, placeholder: t("search_ph"), style: { border: "none", background: "transparent", fontSize: "13px", width: "100%" }, onInput: (e: Event) => { this.query = (e.target as HTMLInputElement).value; this.render(); (this.root.querySelector("input") as HTMLInputElement)?.focus(); } })
    );

    return el("div", { style: { position: "sticky", top: "12px", zIndex: "30", display: "flex", alignItems: "center", gap: "14px", padding: "11px 14px", border: `1px solid ${COLORS.border}`, borderRadius: "13px", background: "rgba(18,20,23,0.72)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" } }, crumbs, el("div", { style: { flex: "1" } }), search);
  }

  private renderCrawlBar(accent: string): HTMLElement {
    const depthSel = el("select", {
      class: "mono", style: { background: "#101215", color: COLORS.text, border: `1px solid ${COLORS.border2}`, borderRadius: "8px", padding: "6px 8px", fontSize: "12px" },
      onChange: (e: Event) => { this.crawl.depth = Number((e.target as HTMLSelectElement).value); },
    });
    for (const [v, label] of [["0", t("depth_0")], ["1", t("depth_1")], ["2", t("depth_2")], ["3", t("depth_3")], ["999", t("depth_inf")]] as const) {
      const o = el("option", { value: v }, label);
      if (Number(v) === this.crawl.depth) o.selected = true;
      depthSel.append(o);
    }

    const probeChk = el("input", { type: "checkbox", onChange: (e: Event) => { this.settings.crawl.probePerDir = (e.target as HTMLInputElement).checked; void saveSettings(this.settings); } });
    probeChk.checked = this.settings.crawl.probePerDir;
    const probeLabel = el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: COLORS.textDim, cursor: "pointer" }, title: t("hidden_in_folders_title", this.settings.crawl.probePerDirMax) }, probeChk, t("hidden_in_folders"));

    const left = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", rowGap: "8px" } },
      icon("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", { size: 15, stroke: accent }),
      el("span", { style: { fontSize: "12.5px", color: COLORS.textDim } }, t("crawl_title")),
      depthSel,
      probeLabel
    );

    const right = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", rowGap: "8px" } });
    if (!this.crawl.running) {
      right.append(this.btn(t("crawl_go"), () => this.startCrawl(false), { background: accent, color: COLORS.onAccent, border: "1px solid transparent", fontWeight: "600" }, "hover-bright"));
      right.append(this.btn(t("crawl_refresh"), () => this.startCrawl(true)));
      if (this.hasCrawlData()) right.append(this.btn(t("crawl_reset"), () => this.resetCrawl(), { color: "#e08a8a" }, "hover-danger"));
    } else {
      const p = this.crawl.progress;
      right.append(el("span", { class: "mono", style: { fontSize: "12px", color: COLORS.muted } }, p ? t("crawl_progress", p.dirsFound, p.filesFound, p.errors) : t("crawl_start")));
      right.append(this.btn(this.crawl.paused ? t("resume") : t("pause"), () => this.crawlControl(this.crawl.paused ? "resume" : "pause")));
      right.append(this.btn(t("cancel"), () => this.crawlControl("cancel"), { color: "#e08a8a" }, "hover-danger"));
    }
    right.append(this.btn(t("check_broken"), () => this.checkAll(true)));

    return el("div", { style: { marginTop: "12px", display: "flex", alignItems: "center", gap: "14px", rowGap: "10px", flexWrap: "wrap", padding: "10px 14px", border: `1px solid ${COLORS.border}`, borderRadius: "12px", background: COLORS.panel } }, left, el("div", { style: { flex: "1", minWidth: "20px" } }), right);
  }

  private renderScanner(accent: string): HTMLElement | null {
    const secrets = this.secrets();
    if (!this.scanning && !secrets.length) return null;
    const card = scannerCard({
      scanning: this.scanning,
      probed: this.probed,
      secrets,
      open: this.scanOpen,
      accent,
      onToggle: () => { this.scanOpen = !this.scanOpen; this.render(); },
      onOpenSecret: (href) => window.open(href, "_blank"),
    });
    card.style.marginTop = "14px";
    return card;
  }

  private renderTableHead(accent: string): HTMLElement {
    const vis = this.visible().filter((e) => !e.isDir);
    const allSel = vis.length > 0 && vis.every((e) => this.selected.has(e.href));
    const someSel = vis.some((e) => this.selected.has(e.href));
    const arrow = (k: SortKey) => (this.sortKey === k ? (this.sortDir === 1 ? " ↑" : " ↓") : "");
    const hc = (k: SortKey) => (this.sortKey === k ? COLORS.text2 : COLORS.faint);
    const cell = (label: string, k: SortKey, extra?: Record<string, string>) =>
      el("div", { style: { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: hc(k), ...extra }, onClick: () => this.setSort(k) }, label + arrow(k));

    const box = el("span", { style: { width: "17px", height: "17px", borderRadius: "5px", border: `1.5px solid ${allSel || someSel ? accent : "#3a3f47"}`, background: allSel ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" } }, icon("M20 6L9 17l-5-5", { size: 11, strokeWidth: 3.5, stroke: COLORS.bg, fill: "none" }));
    (box.firstChild as SVGElement).setAttribute("style", `opacity:${allSel ? 1 : 0}`);

    return el("div", { style: { display: "grid", gridTemplateColumns: "34px 1fr 128px 88px 96px", alignItems: "center", gap: "12px", padding: "18px 16px 9px", fontSize: "11.5px", letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.faint } },
      el("div", { style: { display: "flex", justifyContent: "center", cursor: "pointer" }, onClick: () => this.selectAllVisible() }, box),
      cell(t("col_name"), "name"),
      cell(t("col_modified"), "modified"),
      cell(t("col_size"), "size", { justifyContent: "flex-end" }),
      cell(t("col_type"), "type", { justifyContent: "flex-end" })
    );
  }

  private buildRow(e: DirEntry, accent: string, fixedHeight?: number): HTMLElement {
    const isSel = this.selected.has(e.href);
    const style = styleFor(e, this.settings.rules);
    const tint = CATEGORY_TINT[e.category];
    const iconKey = this.settings.categoryIcons[e.category] || CATEGORY_ICON[e.category];
    const typeLabel = e.isDir ? "DIR" : (e.ext || e.category).toUpperCase().slice(0, 4);
    const status = this.statuses.get(e.href);

    const box = el("span", { style: { width: "17px", height: "17px", borderRadius: "5px", border: `1.5px solid ${isSel ? accent : "#3a3f47"}`, background: isSel ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" } }, icon("M20 6L9 17l-5-5", { size: 11, strokeWidth: 3.5, stroke: COLORS.bg }));
    (box.firstChild as SVGElement).setAttribute("style", `opacity:${isSel ? 1 : 0}`);
    // Checkbox toggles selection only (folders aren't selectable → empty cell).
    const checkCell = e.isDir
      ? el("div")
      : el("div", { style: { display: "flex", justifyContent: "center", cursor: "pointer" }, title: t("select"), onClick: (ev: Event) => { ev.stopPropagation(); this.toggleSel(e.href); } }, box);

    // Explicit open action (row click also opens; button is the obvious affordance).
    const openBtn = el("button", { class: "hoverable hover-surface", title: e.isDir ? t("open_folder") : t("open_file"), style: { flex: "none", border: `1px solid ${COLORS.border2}`, background: "transparent", color: COLORS.textDim, width: "28px", height: "28px", borderRadius: "7px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, onClick: (ev: Event) => { ev.stopPropagation(); this.openEntry(e); } },
      icon(e.isDir ? "M9 6l6 6-6 6" : "M7 17L17 7 M9 7h8v8", { size: 13, strokeWidth: 2 }));

    const nameCol = el("div", { style: { display: "flex", alignItems: "center", gap: "12px", minWidth: "0" } },
      el("span", { style: { flex: "none", width: "30px", height: "30px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, background: COLORS.panel3, display: "flex", alignItems: "center", justifyContent: "center" } }, icon(ICON_PATHS[iconKey] || ICON_PATHS.unknown, { size: 16, strokeWidth: 1.5, stroke: style?.iconTint || tint })),
      (() => {
        const loc = this.locationOf(e);
        const subParts = [loc ? "/" + loc + "/" : "", status && status !== "ok" ? `● ${status}` : ""].filter(Boolean);
        const sub = subParts.join("  ·  ");
        return el("div", { style: { display: "flex", flexDirection: "column", minWidth: "0", lineHeight: "1.35" } },
          el("span", { style: { fontSize: "13.5px", color: e.isDir ? COLORS.text : COLORS.text2, fontWeight: e.isDir ? "600" : "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, e.name),
          sub ? el("span", { class: "mono", title: sub, style: { fontSize: "11px", color: COLORS.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, sub) : null
        );
      })(),
      el("div", { style: { flex: "1" } }),
      openBtn
    );

    const badges = el("div", { style: { textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "6px", alignItems: "center" } });
    if (e.hidden) badges.append(el("span", { style: { fontSize: "10px", textTransform: "uppercase", color: "#e08a8a", border: `1px solid ${hexA("#e08a8a", 0.4)}`, background: hexA("#e08a8a", 0.1), padding: "2px 6px", borderRadius: "5px" } }, t("badge_hidden")));
    if (style?.badge) badges.append(el("span", { style: { fontSize: "10px", textTransform: "uppercase", color: style.badge.color, border: `1px solid ${hexA(style.badge.color, 0.4)}`, background: hexA(style.badge.color, 0.1), padding: "2px 6px", borderRadius: "5px" } }, style.badge.label));
    if (status && status !== "ok") badges.append(el("span", { style: { fontSize: "10px", textTransform: "uppercase", color: STATUS_COLOR[status], border: `1px solid ${hexA(STATUS_COLOR[status], 0.4)}`, background: hexA(STATUS_COLOR[status], 0.1), padding: "2px 6px", borderRadius: "5px" } }, status));
    badges.append(el("span", { style: { fontSize: "10.5px", letterSpacing: "0.04em", textTransform: "uppercase", color: tint, border: `1px solid ${COLORS.border}`, background: COLORS.panel3, padding: "3px 7px", borderRadius: "6px" } }, typeLabel));

    const rowStyle: Record<string, string> = {
      display: "grid", gridTemplateColumns: "34px 1fr 128px 88px 96px", alignItems: "center", gap: "12px",
      padding: this.settings.theme.density === "compact" ? "8px 16px" : "13px 16px",
      borderBottom: `1px solid ${COLORS.borderRow}`, cursor: "pointer",
      background: isSel ? "rgba(255,255,255,0.05)" : (style?.tint ? hexA(style.tint, 0.1) : "transparent"),
      boxShadow: style?.outline ? `inset 3px 0 0 ${style.outline}` : "none",
    };
    if (fixedHeight) { rowStyle.height = fixedHeight + "px"; rowStyle.padding = "0 16px"; }

    return el("div", { class: "hoverable hover-row", style: rowStyle, onClick: () => this.openEntry(e) },
      checkCell,
      nameCol,
      el("div", { class: "mono", style: { fontSize: "12px", color: COLORS.muted } }, e.isDir ? "—" : fmtDate(e.modifiedTs, e.modified)),
      el("div", { class: "mono", style: { fontSize: "12px", color: COLORS.textDim, textAlign: "right" } }, fmtSize(e.size)),
      badges
    );
  }

  private renderRows(accent: string): HTMLElement {
    const vis = this.visible();
    const wrap = el("div", { class: "ode-scroll", style: { border: `1px solid ${COLORS.border3}`, borderRadius: "14px", overflow: "hidden", background: COLORS.panel } });
    if (!vis.length) {
      wrap.append(el("div", { style: { padding: "48px", textAlign: "center", color: COLORS.placeholder, fontSize: "13px" } }, "Ничего не найдено"));
      return wrap;
    }
    if (vis.length <= VIRTUAL_THRESHOLD) {
      for (const e of vis) wrap.append(this.buildRow(e, accent));
      return wrap;
    }
    // Virtualized window for very large directories.
    const rh = this.rowHeight();
    const viewport = el("div", { class: "ode-scroll", style: { maxHeight: "70vh", overflowY: "auto", position: "relative" } });
    const spacer = el("div", { style: { height: vis.length * rh + "px", position: "relative" } });
    viewport.append(spacer);
    const renderWindow = () => {
      const scrollTop = viewport.scrollTop;
      const h = viewport.clientHeight || 600;
      const start = Math.max(0, Math.floor(scrollTop / rh) - 5);
      const end = Math.min(vis.length, Math.ceil((scrollTop + h) / rh) + 5);
      clear(spacer);
      const slice = el("div", { style: { position: "absolute", top: start * rh + "px", left: "0", right: "0" } });
      for (let i = start; i < end; i++) slice.append(this.buildRow(vis[i], accent, rh));
      spacer.append(slice);
    };
    viewport.addEventListener("scroll", renderWindow);
    // Defer first window calc until in DOM (clientHeight known).
    setTimeout(renderWindow, 0);
    wrap.append(viewport);
    return wrap;
  }

  private renderFooter(): HTMLElement {
    const vis = this.visible();
    return el("div", { class: "mono", style: { display: "flex", alignItems: "center", gap: "10px", padding: "20px 6px 0", fontSize: "11.5px", color: "#4d545d" } },
      el("span", {}, this.serverLabel),
      el("span", { style: { color: COLORS.border2 } }, "•"),
      el("span", {}, t("items", vis.length)),
      el("div", { style: { flex: "1" } }),
      el("span", {}, location.protocol.replace(":", ""))
    );
  }

  private renderSelectionBar(accent: string): HTMLElement {
    const files = this.selectedEntries();
    const total = files.reduce((a, e) => a + (e.size ?? 0), 0);
    const bar = el("div", { style: { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "26px", zIndex: "40", display: "flex", alignItems: "center", gap: "14px", padding: "11px 12px 11px 20px", border: `1px solid ${COLORS.borderBar}`, borderRadius: "15px", background: "rgba(18,20,23,0.82)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 20px 50px -20px rgba(0,0,0,0.8)" } },
      el("span", { style: { fontSize: "13px", color: "#b6bcc4" } }, el("b", { style: { color: "#fff", fontWeight: "600" } }, String(files.length)), " " + t("selected")),
      el("span", { class: "mono", style: { fontSize: "12px", color: COLORS.faint } }, fmtSize(total)),
      el("span", { style: { width: "1px", height: "22px", background: COLORS.borderBar } }),
      this.btn(t("clear"), () => { this.selected.clear(); this.render(); }, { background: "transparent", color: "#b6bcc4" }),
      this.btn(t("copy"), () => this.copyLinks(), { background: "transparent", color: "#b6bcc4" }),
      this.btn(t("tabs"), () => this.openInTabs(), { background: "transparent", color: "#b6bcc4" }),
      this.exportMenu(accent)
    );
    return bar;
  }

  private exportMenu(accent: string): HTMLElement {
    const dlBtn = this.btn(
      el("span", { style: { display: "flex", alignItems: "center", gap: "8px" } }, icon("M12 3v12m0 0l-4-4m4 4l4-4M5 21h14", { size: 15, strokeWidth: 2, stroke: COLORS.onAccent }), t("download")),
      () => { this.menuOpen = !this.menuOpen; this.render(); },
      { background: accent, color: COLORS.onAccent, border: "1px solid transparent", fontWeight: "600" },
      "hover-bright"
    );
    const holder = el("div", { style: { position: "relative" } }, dlBtn);
    if (this.menuOpen) {
      const item = (label: string, fn: () => void) =>
        el("div", { class: "hoverable hover-surface", style: { padding: "9px 14px", fontSize: "13px", color: COLORS.text2, cursor: "pointer", whiteSpace: "nowrap" }, onClick: () => { this.menuOpen = false; fn(); } }, label);
      const menu = el("div", { class: "ode-scroll", style: { position: "absolute", bottom: "48px", right: "0", background: COLORS.panel, border: `1px solid ${COLORS.border2}`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 20px 50px -22px rgba(0,0,0,0.85)", minWidth: "220px", maxHeight: "60vh", overflowY: "auto" } },
        item(t("exp_files"), () => this.doDownloadStructure()),
        item(t("exp_zip"), () => this.doZip()),
        item(t("exp_aria2"), () => this.doExportList("aria2")),
        item(t("exp_wget_i"), () => this.doExportList("wget-i")),
        item(t("exp_wget_r"), () => this.doExportList("wget-r")),
        item(t("exp_jd"), () => this.doExportList("jdownloader")),
        item(t("exp_rclone"), () => this.doExportList("rclone")),
        item(t("exp_m3u"), () => this.doExportList("m3u8")),
        item(t("exp_json"), () => this.doExportList("json")),
        item(t("exp_csv"), () => this.doExportList("csv")),
        item(t("exp_txt"), () => this.doExportList("txt"))
      );
      holder.append(menu);
    }
    return holder;
  }

  // ---------- in-page rules modal (ported from the concept) ----------

  private saveRules(): void {
    void saveSettings(this.settings);
    this.render();
  }

  private renderSettingsModal(): HTMLElement {
    const rules = el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
    this.settings.rules.forEach((r, i) => rules.append(this.ruleCard(r, i)));

    const addBtn = el("button", { class: "hoverable hover-dash", style: { marginTop: "12px", width: "100%", border: "1px dashed #2e3339", background: "transparent", color: COLORS.textDim, fontSize: "13px", padding: "11px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }, onClick: () => {
      this.settings.rules.push({ id: "r-" + Date.now().toString(36), enabled: true, kind: "glob", value: "", action: "tint", color: RULE_PALETTE[this.settings.rules.length % RULE_PALETTE.length], priority: this.settings.rules.length });
      this.saveRules();
    } }, icon("M12 5v14M5 12h14", { size: 15, strokeWidth: 2 }), t("add_rule"));

    const closeX = el("button", { class: "hoverable hover-surface", style: { border: `1px solid ${COLORS.border2}`, background: "transparent", color: COLORS.textDim, width: "32px", height: "32px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, onClick: () => { this.settingsOpen = false; this.render(); } }, icon("M18 6L6 18M6 6l12 12", { size: 15, strokeWidth: 2 }));

    const langSel = el("select", { title: t("lang_label"), style: { background: "#0b0d10", color: COLORS.text, border: `1px solid ${COLORS.border2}`, borderRadius: "8px", padding: "6px 8px", fontSize: "12px" }, onChange: (e: Event) => { this.settings.lang = (e.target as HTMLSelectElement).value as Settings["lang"]; setLang(this.settings.lang); this.saveRules(); } });
    for (const [v, label] of [["auto", t("lang_auto")], ["en", "English"], ["ru", "Русский"]] as const) {
      const o = el("option", { value: v }, label);
      if (v === this.settings.lang) o.selected = true;
      langSel.append(o);
    }

    const header = el("div", { style: { display: "flex", alignItems: "center", gap: "12px", padding: "20px 22px", borderBottom: `1px solid ${COLORS.borderRow}` } },
      el("div", { style: { display: "flex", flexDirection: "column", lineHeight: "1.3" } },
        el("span", { style: { fontSize: "16px", fontWeight: "600", letterSpacing: "-0.01em" } }, t("modal_title")),
        el("span", { style: { fontSize: "12px", color: COLORS.muted } }, t("modal_sub"))
      ),
      el("div", { style: { flex: "1" } }),
      langSel,
      closeX
    );

    const panel = el("div", { class: "ode-scroll", style: { width: "100%", maxWidth: "620px", border: `1px solid ${COLORS.border2}`, borderRadius: "16px", background: COLORS.panel, overflow: "hidden" }, onClick: (e: Event) => e.stopPropagation() },
      header,
      el("div", { style: { padding: "18px 22px 22px" } },
        el("div", { style: { fontSize: "11.5px", letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.faint, marginBottom: "12px" } }, t("rules_section")),
        rules,
        addBtn,
        this.renderHiddenSection()
      )
    );

    return el("div", { class: "ode-scroll", style: { position: "fixed", inset: "0", zIndex: "70", background: "rgba(6,7,8,0.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "48px 20px", overflowY: "auto" }, onClick: () => { this.settingsOpen = false; this.render(); } }, panel);
  }

  private ruleCard(rule: HighlightRule, index: number): HTMLElement {
    const swatch = el("span", { style: { flex: "none", width: "24px", height: "24px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", background: hexA(rule.color, 0.14), border: `1px solid ${hexA(rule.color, 0.4)}` } }, el("span", { style: { width: "10px", height: "10px", borderRadius: "3px", background: rule.color } }));

    const value = el("input", { value: rule.value, placeholder: rule.kind === "ext" ? t("rule_ph_ext") : rule.kind === "regex" ? t("rule_ph_regex") : rule.kind === "glob" ? t("rule_ph_glob") : t("rule_ph_exact"), class: "mono", style: { flex: "1", border: `1px solid ${COLORS.border2}`, background: "#0b0d10", borderRadius: "8px", padding: "8px 11px", fontSize: "13px", color: COLORS.text, minWidth: "0" }, onChange: (e: Event) => { rule.value = (e.target as HTMLInputElement).value; void saveSettings(this.settings); } });

    const enabled = el("input", { type: "checkbox", title: t("enabled"), style: { cursor: "pointer" }, onChange: (e: Event) => { rule.enabled = (e.target as HTMLInputElement).checked; this.saveRules(); } });
    (enabled as HTMLInputElement).checked = rule.enabled;

    const del = el("button", { class: "hoverable hover-danger", style: { flex: "none", border: `1px solid ${COLORS.border2}`, background: "transparent", color: COLORS.muted, width: "34px", height: "34px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, onClick: () => { this.settings.rules.splice(index, 1); this.saveRules(); } }, icon("M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14", { size: 15, strokeWidth: 1.8 }));

    const seg = <T extends string>(opts: [T, string][], cur: T, pick: (v: T) => void) =>
      el("div", { style: { display: "flex", border: `1px solid ${COLORS.border2}`, borderRadius: "8px", overflow: "hidden" } },
        ...opts.map(([v, label], i) => el("button", { style: { border: "none", borderLeft: i ? `1px solid ${COLORS.border2}` : "none", background: v === cur ? COLORS.hover : "transparent", color: v === cur ? COLORS.text : COLORS.muted, fontSize: "12px", padding: "6px 11px", cursor: "pointer" }, onClick: () => pick(v) }, label))
      );

    const kindSeg = seg<MatchKind>([["ext", t("kind_ext")], ["glob", t("kind_glob")], ["regex", t("kind_regex")], ["exact", t("kind_exact")]], rule.kind, (v) => { rule.kind = v; this.saveRules(); });
    const actionSeg = seg<HighlightAction>([["tint", t("act_tint")], ["outline", t("act_outline")], ["badge", t("act_badge")], ["icon", t("act_icon")]], rule.action, (v) => { rule.action = v; this.saveRules(); });

    const palette = el("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
      ...[...RULE_PALETTE].map((c) => el("span", { style: { width: "20px", height: "20px", borderRadius: "6px", background: c, cursor: "pointer", border: `2px solid ${c === rule.color ? COLORS.text : "transparent"}`, boxSizing: "border-box" }, onClick: () => { rule.color = c; this.saveRules(); } }))
    );

    const badgeInput = rule.action === "badge"
      ? el("input", { value: rule.badgeLabel || "flag", placeholder: t("badge_text_ph"), style: { border: `1px solid ${COLORS.border2}`, background: "#0b0d10", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", color: COLORS.text, width: "130px" }, onChange: (e: Event) => { rule.badgeLabel = (e.target as HTMLInputElement).value; void saveSettings(this.settings); } })
      : null;

    return el("div", { style: { border: `1px solid ${COLORS.border}`, borderRadius: "12px", background: "#101215", padding: "13px 14px", display: "flex", flexDirection: "column", gap: "12px", opacity: rule.enabled ? "1" : "0.55" } },
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, swatch, value, el("label", { style: { display: "flex", alignItems: "center", cursor: "pointer" }, title: "Включено" }, enabled), del),
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } }, kindSeg, actionSeg, badgeInput, el("div", { style: { flex: "1" } }), palette)
    );
  }

  // Hidden-file probe list, edited as removable chips.
  private renderHiddenSection(): HTMLElement {
    const s = this.settings.scanner;
    const master = el("input", { type: "checkbox", style: { cursor: "pointer" }, onChange: (e: Event) => { s.enabled = (e.target as HTMLInputElement).checked; this.saveRules(); } });
    (master as HTMLInputElement).checked = s.enabled;

    const chips = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", opacity: s.enabled ? "1" : "0.5" } });
    s.paths.forEach((p, i) => chips.append(this.hiddenChip(p, i)));

    const add = el("input", { id: "ode-hidden-add", placeholder: t("hidden_files_ph"), class: "mono", style: { border: `1px solid ${COLORS.border2}`, background: "#0b0d10", borderRadius: "8px", padding: "6px 10px", fontSize: "12.5px", color: COLORS.text, minWidth: "150px", flex: "1" }, onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const input = e.target as HTMLInputElement;
      const v = input.value.trim();
      input.value = "";
      if (v && !s.paths.some((x) => x.value === v)) {
        s.paths.push({ value: v, enabled: true, risk: "high", note: "" });
        this.saveRules();
        setTimeout(() => (this.root.querySelector("#ode-hidden-add") as HTMLInputElement | null)?.focus(), 0);
      }
    } });
    chips.append(add);

    return el("div", { style: { marginTop: "22px" } },
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" } },
        el("span", { style: { fontSize: "11.5px", letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.faint } }, t("hidden_files_section")),
        el("div", { style: { flex: "1" } }),
        el("label", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: COLORS.textDim, cursor: "pointer" } }, master, t("scan_enable_short"))
      ),
      chips
    );
  }

  private hiddenChip(p: ScanPath, index: number): HTMLElement {
    return el("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 6px 5px 10px", border: `1px solid ${COLORS.border2}`, borderRadius: "8px", background: COLORS.panel2, opacity: p.enabled ? "1" : "0.5" } },
      el("span", { class: "mono", style: { fontSize: "12.5px", color: COLORS.text2 } }, p.value),
      el("button", { class: "hoverable hover-danger", title: "×", style: { border: "none", background: "transparent", color: COLORS.muted, width: "18px", height: "18px", borderRadius: "5px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "0" }, onClick: () => { this.settings.scanner.paths.splice(index, 1); this.saveRules(); } }, icon("M18 6L6 18M6 6l12 12", { size: 12, strokeWidth: 2 }))
    );
  }

  private renderToast(): HTMLElement {
    return el("div", { style: { position: "fixed", left: "50%", transform: "translateX(-50%)", top: "22px", zIndex: "60", display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", border: `1px solid ${COLORS.borderBar}`, borderRadius: "12px", background: "rgba(16,18,21,0.9)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: "0 14px 40px -16px rgba(0,0,0,0.8)" } },
      el("span", { style: { flex: "none", width: "26px", height: "26px", borderRadius: "8px", background: "rgba(78,201,138,0.14)", border: "1px solid rgba(78,201,138,0.3)", display: "flex", alignItems: "center", justifyContent: "center" } }, icon("M20 6L9 17l-5-5", { size: 14, strokeWidth: 2.4, stroke: "#4ec98a" })),
      el("div", { style: { display: "flex", flexDirection: "column", lineHeight: "1.35" } },
        el("span", { style: { fontSize: "13px", color: COLORS.text } }, this.toast!.title),
        el("span", { style: { fontSize: "11.5px", color: COLORS.muted } }, this.toast!.text)
      )
    );
  }
}

const STATUS_COLOR: Record<LinkStatus, string> = {
  ok: "#4ec98a",
  broken: "#e08a8a",
  empty: "#d6a878",
  unreachable: "#b192b2",
  unknown: "#9aa2ac",
};
