// Recursive crawler built on a concurrency pool (network is I/O-bound, so we
// use N concurrent fetches, not threads). Supports depth limits, per-request
// timeout, throttling, pause and cancel.
import type { CrawlOptions, DirEntry } from "./types";
import { parseListingHtml } from "./parser";
import { probe } from "./checker";
import { categorize } from "./icons";

export interface CrawlProgress {
  dirsFound: number;
  filesFound: number;
  errors: number;
  queued: number;
  active: number;
  currentPath: string | null;
  done: boolean;
}

export interface CrawlHandle {
  promise: Promise<DirEntry[]>;
  cancel(): void;
  pause(): void;
  resume(): void;
}

interface QueueItem {
  url: string;
  level: number;
}

/** Build a DirEntry for a probe-discovered hidden file. `name` keeps the probe
 *  path verbatim so the UI can map it back to its scan-rule risk/note. */
function hiddenEntry(pathValue: string, href: string, parentHref: string, level: number): DirEntry {
  const base = pathValue.split("/").pop() || pathValue;
  const { category, ext } = categorize(base, false);
  return {
    name: pathValue,
    href,
    isDir: false,
    size: null,
    sizeLabel: null,
    modified: null,
    modifiedTs: null,
    category,
    ext,
    depth: level,
    parentHref,
    hidden: true,
  };
}

async function fetchDir(
  url: string,
  timeoutMs: number,
  external: AbortSignal
): Promise<{ html: string; header: string | null }> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  external.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const header = res.headers.get("server");
    const html = await res.text();
    return { html, header };
  } finally {
    clearTimeout(timer);
    external.removeEventListener("abort", onAbort);
  }
}

export function startCrawl(
  rootUrl: string,
  opts: CrawlOptions,
  onProgress: (p: CrawlProgress) => void,
  onBatch?: (entries: DirEntry[]) => void
): CrawlHandle {
  const abort = new AbortController();
  const results: DirEntry[] = [];
  const visited = new Set<string>();
  const queue: QueueItem[] = [{ url: rootUrl, level: 0 }];
  const maxDepth = opts.depth;
  const progress: CrawlProgress = {
    dirsFound: 0,
    filesFound: 0,
    errors: 0,
    queued: 1,
    active: 0,
    currentPath: null,
    done: false,
  };

  let paused = false;
  let resumeWaiters: Array<() => void> = [];
  const gate = () =>
    paused ? new Promise<void>((r) => resumeWaiters.push(r)) : Promise.resolve();

  const normalize = (u: string) => u.replace(/\/+$/, "/");

  async function processDir(item: QueueItem): Promise<void> {
    progress.currentPath = new URL(item.url).pathname;
    try {
      const { html, header } = await fetchDir(item.url, opts.timeoutMs, abort.signal);
      const parsed = parseListingHtml(html, item.url, header, item.level);
      const batch: DirEntry[] = [];
      for (const entry of parsed.entries) {
        results.push(entry);
        batch.push(entry);
        if (entry.isDir) {
          progress.dirsFound++;
          if (item.level < maxDepth) {
            const key = normalize(entry.href);
            if (!visited.has(key)) {
              visited.add(key);
              queue.push({ url: entry.href, level: item.level + 1 });
              progress.queued++;
            }
          }
        } else {
          progress.filesFound++;
        }
      }
      // Passive per-directory probing (capped to avoid 429s).
      if (opts.probePerDir && opts.probePaths && opts.probePaths.length) {
        const base = item.url.endsWith("/") ? item.url : item.url + "/";
        const candidates = opts.probePaths.slice(0, Math.max(1, opts.probePerDirMax));
        for (const p of candidates) {
          if (abort.signal.aborted) break;
          let url: string;
          try {
            url = new URL(p, base).href;
          } catch {
            continue;
          }
          if (parsed.entries.some((e) => e.href === url) || results.some((e) => e.href === url)) continue;
          const r = await probe(url, opts.timeoutMs, abort.signal);
          if (r === "found" || r === "protected") {
            const entry = hiddenEntry(p, url, item.url, item.level);
            results.push(entry);
            batch.push(entry);
            progress.filesFound++;
          }
          if (opts.throttleMs > 0) await new Promise((res) => setTimeout(res, opts.throttleMs));
        }
      }
      onBatch?.(batch);
    } catch (e) {
      if (!abort.signal.aborted) progress.errors++;
    }
  }

  async function worker(): Promise<void> {
    while (!abort.signal.aborted) {
      await gate();
      const item = queue.shift();
      if (!item) return;
      progress.active++;
      await processDir(item);
      progress.active--;
      onProgress({ ...progress });
      if (opts.throttleMs > 0) await new Promise((r) => setTimeout(r, opts.throttleMs));
    }
  }

  const promise = (async () => {
    visited.add(normalize(rootUrl));
    // Prime workers; they keep pulling until the queue drains.
    const n = Math.max(1, opts.concurrency);
    // Loop rounds until queue empty and no active work.
    while (!abort.signal.aborted && (queue.length > 0 || progress.active > 0)) {
      const workers = Array.from({ length: Math.min(n, queue.length || 1) }, () => worker());
      await Promise.all(workers);
    }
    progress.done = true;
    progress.currentPath = null;
    onProgress({ ...progress });
    return results;
  })();

  return {
    promise,
    cancel: () => abort.abort(),
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      const w = resumeWaiters;
      resumeWaiters = [];
      w.forEach((r) => r());
    },
  };
}
