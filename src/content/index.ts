// Content entry point — injected on demand via the toolbar action (activeTab).
// Detects whether the page is a directory listing and, if so, mounts the
// explorer UI over it.
import { detectListing, parseListing } from "../shared/parser";
import { getSettings } from "../shared/storage";
import { t, setLang } from "../shared/i18n";
import type { ProbeResult } from "../shared/checker";
import { App } from "./ui/app";
import { ROOT_ID, styleSheet } from "./ui/styles";
import { buildCandidates, currentDir, runProbe, scannerCard, type Secret } from "./ui/scanner";

declare global {
  interface Window {
    __odeInjected?: boolean;
    __odeManual?: boolean; // set by the popup before manual injection
  }
}

async function serverHeader(): Promise<string | null> {
  try {
    const res = await fetch(location.href, { method: "HEAD", credentials: "omit" });
    return res.headers.get("server");
  } catch {
    return null;
  }
}

function flash(message: string): void {
  const note = document.createElement("div");
  note.textContent = message;
  Object.assign(note.style, {
    position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)",
    zIndex: "2147483647", background: "#101215", color: "#e6e8ea",
    border: "1px solid #2c3037", borderRadius: "12px", padding: "12px 16px",
    font: "13px ui-sans-serif, system-ui, sans-serif", boxShadow: "0 14px 40px -16px rgba(0,0,0,0.8)",
  } as CSSStyleDeclaration);
  document.documentElement.append(note);
  setTimeout(() => note.remove(), 3500);
}

async function main(): Promise<void> {
  const manual = window.__odeManual === true;
  window.__odeManual = false;

  if (window.__odeInjected) {
    // Toggle off on a second (manual) activation.
    if (manual) closeOverlay();
    return;
  }

  // Auto mode skips the extra HEAD request; DOM detection is enough. Manual mode
  // fetches the Server header for a more accurate server-type label.
  const header = manual ? await serverHeader() : null;
  const detection = detectListing(document, header);

  if (!detection.isListing) {
    // Auto injection on a normal page: stay silent, do nothing.
    if (!manual) return;
    // Manual activation on a non-listing page: run the passive scanner against
    // this path (e.g. a plain 127.0.0.1/ page) and float the concept card.
    const settings = await getSettings();
    setLang(settings.lang);
    if (settings.scanner.enabled && settings.scanner.paths.some((p) => p.enabled)) {
      runStandaloneScanner(settings.scanner.concurrency, settings.scanner.timeoutMs, settings.theme.accent, settings.scanner.paths);
    } else {
      flash(t("flash_prefix") + ": " + t("flash_not_listing"));
    }
    return;
  }

  const parsed = parseListing(document, location.href, header, 0);
  if (!parsed.entries.length) {
    if (manual) flash(t("flash_prefix") + ": " + t("flash_no_entries"));
    return;
  }

  const root = mountRoot(false);
  document.documentElement.style.overflow = "hidden"; // freeze the page behind us

  const app = new App(root, parsed.entries, detection.server, parsed.path);
  await app.init();
}

// ---------- shared mount helpers ----------

function mountRoot(floating: boolean): HTMLElement {
  window.__odeInjected = true;
  const style = document.createElement("style");
  style.id = "ode-style";
  style.textContent = styleSheet();
  document.documentElement.append(style);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  if (floating) root.classList.add("ode-floating");
  document.documentElement.append(root);
  return root;
}

function closeOverlay(): void {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById("ode-style")?.remove();
  window.__odeInjected = false;
  document.documentElement.style.overflow = "";
}

// ---------- standalone passive scanner (non-listing pages) ----------

function runStandaloneScanner(
  concurrency: number,
  timeoutMs: number,
  accent: string,
  paths: import("../shared/types").ScanPath[]
): void {
  const candidates = buildCandidates(currentDir(), paths, new Set());
  if (!candidates.length) {
    flash(t("flash_prefix") + ": " + t("flash_no_paths"));
    return;
  }
  const byUrl = new Map(candidates.map((c) => [c.url, c.path]));
  const root = mountRoot(true);

  let scanning = true;
  let open = true;
  const secrets: Secret[] = [];
  const probed = { done: 0, total: candidates.length };

  const paint = () => {
    root.replaceChildren(
      scannerCard({
        scanning,
        probed,
        secrets,
        open,
        accent,
        onToggle: () => { open = !open; paint(); },
        onOpenSecret: (href) => window.open(href, "_blank"),
        onClose: closeOverlay,
      })
    );
  };
  paint();

  const onResult = (url: string, result: ProbeResult) => {
    probed.done++;
    if (result === "found" || result === "protected") {
      const p = byUrl.get(url);
      if (p) secrets.push({ name: p.value, href: url, risk: p.risk, note: p.note, source: "hidden", protectedOnly: result === "protected" });
    }
    paint();
  };
  const onDone = () => {
    scanning = false;
    if (!secrets.length) {
      closeOverlay();
      flash(t("flash_prefix") + ": " + t("flash_nothing"));
    } else {
      paint();
    }
  };
  runProbe(candidates.map((c) => c.url), concurrency, timeoutMs, onResult, onDone);
}

void main();
