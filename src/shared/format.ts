// Formatting helpers.

/** Human-readable byte size (ported from the design's fmtSize, extended). */
export function fmtSize(b: number | null | undefined): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return trim(b / 1024) + " K";
  if (b < 1073741824) return trim(b / 1048576) + " M";
  if (b < 1099511627776) return (b / 1073741824).toFixed(2) + " G";
  return (b / 1099511627776).toFixed(2) + " T";
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/**
 * Parse a size label like "1.4M", "734003200", "12 KiB", "3.2 GB" into bytes.
 * Returns null for placeholders ("-", "", directories).
 */
export function parseSize(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s || s === "-" || s === "—") return null;
  const m = s.match(/^([\d.,]+)\s*([kKmMgGtTpP]?)(i?)([bB]?)/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const unit = m[2].toLowerCase();
  const mult: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4, p: 1024 ** 5 };
  return Math.round(num * (mult[unit] ?? 1));
}

/** Parse a variety of listing date formats into epoch ms, or null. */
export function parseDate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s === "-") return null;
  // Try native first (handles ISO, RFC, "2026-07-23 14:43" in most engines).
  const t = Date.parse(s.replace(" ", "T"));
  if (Number.isFinite(t)) return t;
  const t2 = Date.parse(s);
  return Number.isFinite(t2) ? t2 : null;
}

export function fmtDate(ts: number | null, raw: string | null): string {
  if (ts != null) {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return raw ?? "—";
}
