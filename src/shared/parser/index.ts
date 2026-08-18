// Listing detection + parsing entry point. Chooses a server adapter, extracts
// raw rows, then normalises them into DirEntry[] (URL resolution, dir/file,
// category, size/date parsing, service-link filtering).
import type { DirEntry, ListingParseResult, ServerType } from "../types";
import { categorize } from "../icons";
import { parseDate, parseSize } from "../format";
import { ADAPTERS, GENERIC, type ServerAdapter } from "./adapters";
import type { RawRow } from "./extract";

export interface DetectResult {
  isListing: boolean;
  server: ServerType;
  confidence: number; // 0..1
}

const SERVICE_NAME = /^(name|last modified|size|description|parent directory|\.\.|\.\/)$/i;

function pickAdapter(header: string | null, doc: Document): ServerAdapter {
  for (const a of ADAPTERS) if (a.detect(header, doc)) return a;
  return GENERIC;
}

/** Heuristic: is this document a directory listing at all? */
export function detectListing(doc: Document, header: string | null): DetectResult {
  const adapter = pickAdapter(header, doc);
  let score = 0;

  const titleText = (doc.title || "") + " " + (doc.querySelector("h1")?.textContent || "");
  if (/index of|directory listing for|индекс/i.test(titleText)) score += 0.5;
  if (header && /autoindex|directory/i.test(header)) score += 0.2;
  if (adapter.server !== "generic") score += 0.2;

  const rows = adapter.extract(doc) || [];
  const usable = rows.filter((r) => r.name && !SERVICE_NAME.test(r.name.trim()));
  if (usable.length >= 3) score += 0.3;
  if (usable.some((r) => r.isDirHint) && usable.some((r) => !r.isDirHint)) score += 0.15;

  // Guard against normal websites: a real page has lots of non-listing chrome.
  const anchors = doc.querySelectorAll("a[href]").length;
  const scripts = doc.querySelectorAll("script").length;
  if (anchors > 0 && usable.length / Math.max(anchors, 1) < 0.3 && scripts > 5) score -= 0.3;

  return { isListing: score >= 0.6 && usable.length >= 1, server: adapter.server, confidence: Math.max(0, Math.min(1, score)) };
}

function isServiceRow(row: RawRow, base: URL): boolean {
  const name = row.name.trim();
  if (!name || SERVICE_NAME.test(name)) return true;
  const href = row.href.trim();
  if (!href || href.startsWith("#") || href.startsWith("?") || /^(mailto|javascript):/i.test(href)) return true;
  let abs: URL;
  try {
    abs = new URL(href, base);
  } catch {
    return true;
  }
  if (abs.origin !== base.origin) return true; // external link
  const self = base.pathname.replace(/\/+$/, "");
  const target = abs.pathname.replace(/\/+$/, "");
  if (target === self) return true; // self link
  if (self.startsWith(target + "/") || target === "") return true; // ancestor / parent dir
  return false;
}

export function toEntry(row: RawRow, base: URL, depth: number): DirEntry {
  const abs = new URL(row.href, base);
  const isDir = row.isDirHint || /\/$/.test(abs.pathname);
  const name = decodeURIComponent(row.name.replace(/\/+$/, "")) || decodeURIComponent(abs.pathname.split("/").filter(Boolean).pop() || "");
  const { category, ext } = categorize(name, isDir);
  const modifiedTs = parseDate(row.dateText);
  const size = isDir ? null : parseSize(row.sizeText);
  return {
    name,
    href: abs.href,
    isDir,
    size,
    sizeLabel: size == null ? row.sizeText : null,
    modified: row.dateText,
    modifiedTs,
    category,
    ext,
    depth,
    parentHref: base.href,
    childCount: null,
  };
}

export function parseListing(doc: Document, pageUrl: string, header: string | null, depth = 0): ListingParseResult {
  const base = new URL(pageUrl);
  const adapter = pickAdapter(header, doc);
  const rows = adapter.extract(doc) || [];
  const seen = new Set<string>();
  const entries: DirEntry[] = [];
  for (const row of rows) {
    if (isServiceRow(row, base)) continue;
    const entry = toEntry(row, base, depth);
    if (seen.has(entry.href)) continue;
    seen.add(entry.href);
    entries.push(entry);
  }
  return { server: adapter.server, origin: base.origin, path: decodeURIComponent(base.pathname), entries };
}

/** Parse a fetched HTML string (used by the crawler for subdirectories). */
export function parseListingHtml(html: string, pageUrl: string, header: string | null, depth: number): ListingParseResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return parseListing(doc, pageUrl, header, depth);
}
