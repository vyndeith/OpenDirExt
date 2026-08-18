// Per-server adapters: detection + extraction strategy. Everything falls back
// to the generic adapter, which is names/links-accurate and best-effort on meta.
import type { ServerType } from "../types";
import { extractAnchors, extractPre, extractTable, type RawRow } from "./extract";

export interface ServerAdapter {
  server: ServerType;
  detect(header: string | null, doc: Document): boolean;
  extract(doc: Document): RawRow[] | null;
}

const h = (header: string | null, re: RegExp) => !!header && re.test(header);

export const ADAPTERS: ServerAdapter[] = [
  {
    server: "apache",
    detect: (header) => h(header, /apache/i),
    extract: (doc) => extractTable(doc) || extractPre(doc, "after"),
  },
  {
    server: "nginx",
    detect: (header) => h(header, /nginx/i),
    extract: (doc) => extractPre(doc, "after") || extractTable(doc),
  },
  {
    server: "iis",
    detect: (header, doc) => h(header, /iis|microsoft-iis/i) || /Microsoft-IIS/i.test(doc.body?.textContent || ""),
    extract: (doc) => extractPre(doc, "before") || extractTable(doc),
  },
  {
    server: "caddy",
    detect: (header) => h(header, /caddy/i),
    extract: (doc) => extractTable(doc) || extractAnchors(doc),
  },
  {
    server: "lighttpd",
    detect: (header) => h(header, /lighttpd/i),
    extract: (doc) => extractTable(doc) || extractPre(doc, "after"),
  },
  {
    server: "python",
    detect: (header, doc) =>
      h(header, /SimpleHTTP|BaseHTTP|Python/i) || /Directory listing for/i.test(doc.title || ""),
    extract: (doc) => extractAnchors(doc.querySelector("ul") || doc.body),
  },
  {
    server: "h5ai",
    detect: (_header, doc) =>
      !!doc.querySelector('#h5ai, [id*="h5ai"], script[src*="_h5ai"], link[href*="_h5ai"]'),
    extract: (doc) => extractAnchors(doc.body),
  },
];

export const GENERIC: ServerAdapter = {
  server: "generic",
  detect: () => true,
  extract: (doc) => extractTable(doc) || extractPre(doc, "after") || extractAnchors(doc.body),
};
