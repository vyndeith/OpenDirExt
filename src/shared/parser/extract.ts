// Low-level DOM extraction shared by all server adapters. Produces raw rows
// (href + name + best-effort date/size text) without interpreting URLs.

export interface RawRow {
  href: string;
  name: string;
  dateText: string | null;
  sizeText: string | null;
  isDirHint: boolean; // trailing slash / "<dir>" / "Directory" marker
}

const looksDir = (sizeText: string | null, href: string) =>
  /\/$/.test(href.split("?")[0]) ||
  (sizeText != null && /^(<dir>|dir|directory|—)$/i.test(sizeText.trim()));

/** Split a whitespace-collapsed meta string into [date, size]. Size = last token. */
function splitMeta(meta: string): { dateText: string | null; sizeText: string | null } {
  const s = meta.replace(/ /g, " ").trim();
  if (!s) return { dateText: null, sizeText: null };
  const m = s.match(/^(.*?)(\S+)\s*$/);
  if (!m) return { dateText: null, sizeText: s };
  const size = m[2] === "-" ? null : m[2];
  const date = m[1].trim() || null;
  return { dateText: date, sizeText: size };
}

/** Table-based listings (Apache FancyIndexing, lighttpd, Caddy, IIS w/ table). */
export function extractTable(doc: Document): RawRow[] | null {
  const tables = Array.from(doc.querySelectorAll("table"));
  for (const table of tables) {
    const anchors = table.querySelectorAll("a[href]");
    if (anchors.length < 1) continue;

    // Map columns by header text.
    let nameCol = -1,
      dateCol = -1,
      sizeCol = -1;
    const headCells = table.querySelectorAll("thead th, tr:first-child th, tr:first-child td");
    headCells.forEach((c, i) => {
      const t = (c.textContent || "").toLowerCase();
      if (nameCol < 0 && /name|файл|назв/.test(t)) nameCol = i;
      if (dateCol < 0 && /modif|date|last|изм|дата/.test(t)) dateCol = i;
      if (sizeCol < 0 && /size|разм/.test(t)) sizeCol = i;
    });

    const rows: RawRow[] = [];
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      const a = tr.querySelector("a[href]") as HTMLAnchorElement | null;
      if (!a) continue;
      const cells = Array.from(tr.children);
      const href = a.getAttribute("href") || "";
      const name = (a.textContent || "").trim();
      const cellText = (i: number) => (i >= 0 && cells[i] ? (cells[i].textContent || "").trim() : "");
      // Fall back to positional guess when headers are missing.
      const dateText = (dateCol >= 0 ? cellText(dateCol) : "") || null;
      const sizeText = (sizeCol >= 0 ? cellText(sizeCol) : "") || null;
      rows.push({ href, name, dateText, sizeText, isDirHint: looksDir(sizeText, href) });
    }
    if (rows.length) return rows;
  }
  return null;
}

/**
 * <pre>-based listings.
 * mode "after": meta text follows the anchor (Apache, nginx, lighttpd legacy).
 * mode "before": meta text precedes the anchor on the same line (IIS).
 */
export function extractPre(doc: Document, mode: "after" | "before"): RawRow[] | null {
  const pre = doc.querySelector("pre");
  if (!pre) return null;

  if (mode === "before") {
    // IIS: "  7/23/2026  2:43 PM       1024 <a>file</a>" or "<dir>".
    const rows: RawRow[] = [];
    const anchors = Array.from(pre.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    const text = pre.textContent || "";
    const lines = text.split("\n");
    for (const a of anchors) {
      const name = (a.textContent || "").trim();
      const href = a.getAttribute("href") || "";
      const line = lines.find((l) => l.includes(name)) || "";
      const before = line.slice(0, line.indexOf(name));
      const m = before.match(/^\s*([\d/]+\s+[\d:]+\s*[AP]?M?)\s+(<dir>|[\d,]+)?/i);
      const dateText = m ? m[1].trim() : null;
      const sizeText = m && m[2] ? m[2] : null;
      rows.push({ href, name, dateText, sizeText, isDirHint: looksDir(sizeText, href) });
    }
    return rows.length ? rows : null;
  }

  // mode "after"
  const rows: RawRow[] = [];
  let cur: { href: string; name: string; meta: string } | null = null;
  const flush = () => {
    if (!cur) return;
    const { dateText, sizeText } = splitMeta(cur.meta);
    rows.push({ href: cur.href, name: cur.name, dateText, sizeText, isDirHint: looksDir(sizeText, cur.href) });
    cur = null;
  };
  for (const node of Array.from(pre.childNodes)) {
    if (node.nodeName === "A") {
      flush();
      const a = node as HTMLAnchorElement;
      cur = { href: a.getAttribute("href") || "", name: (a.textContent || "").trim(), meta: "" };
    } else if (node.nodeType === Node.TEXT_NODE || node.nodeName === "IMG") {
      const t = node.textContent || "";
      if (!cur) continue;
      const nl = t.indexOf("\n");
      if (nl >= 0) {
        cur.meta += t.slice(0, nl);
        flush();
      } else {
        cur.meta += t;
      }
    }
  }
  flush();
  return rows.length ? rows : null;
}

/** Last-resort: every anchor, no metadata (python http.server, unknown). */
export function extractAnchors(root: ParentNode): RawRow[] {
  const anchors = Array.from(root.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  return anchors.map((a) => {
    const href = a.getAttribute("href") || "";
    return {
      href,
      name: (a.textContent || "").trim(),
      dateText: null,
      sizeText: null,
      isDirHint: /\/$/.test(href.split("?")[0]),
    };
  });
}
