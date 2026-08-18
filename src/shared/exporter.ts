// Export builders. Pure string generation for download-manager list formats;
// ZIP is handled separately (in a worker) because it is CPU-bound.
import type { DirEntry, ExportFormat } from "./types";
import { fmtSize } from "./format";

export interface ExportOutput {
  filename: string;
  mime: string;
  content: string;
}

/** Path of `entry` relative to the crawl root (keeps folder structure). */
export function relPath(entry: DirEntry, rootUrl: string): string {
  try {
    const root = new URL(rootUrl);
    const target = new URL(entry.href);
    let base = decodeURIComponent(root.pathname);
    let path = decodeURIComponent(target.pathname);
    if (!base.endsWith("/")) base += "/";
    if (path.startsWith(base)) path = path.slice(base.length);
    else path = path.replace(/^\/+/, "");
    return path.replace(/^\/+/, "") || entry.name;
  } catch {
    return entry.name;
  }
}

const files = (entries: DirEntry[]) => entries.filter((e) => !e.isDir);

function aria2(entries: DirEntry[], rootUrl: string): string {
  const lines: string[] = [];
  for (const e of files(entries)) {
    const rel = relPath(e, rootUrl);
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    lines.push(e.href);
    lines.push(`  out=${e.name}`);
    if (dir) lines.push(`  dir=${dir}`);
  }
  return lines.join("\n") + "\n";
}

function wgetInput(entries: DirEntry[]): string {
  return files(entries).map((e) => e.href).join("\n") + "\n";
}

function wgetRecursive(rootUrl: string): string {
  const u = new URL(rootUrl);
  return (
    `# Recreate the tree under ./${u.hostname}\n` +
    `wget -r -np -nc -e robots=off --reject "index.html*" \\\n  "${rootUrl}"\n`
  );
}

function jdownloader(entries: DirEntry[], rootUrl: string): string {
  const pkg = new URL(rootUrl).hostname;
  const jobs = files(entries).map((e) => ({
    text: e.href,
    filename: e.name,
    packageName: pkg,
    downloadFolder: relPath(e, rootUrl).replace(/[^/]*$/, "").replace(/\/+$/, ""),
    autoStart: "TRUE",
  }));
  return JSON.stringify(jobs, null, 2);
}

function rclone(entries: DirEntry[], rootUrl: string): string {
  const lines = ["#!/usr/bin/env bash", "set -euo pipefail", 'DEST="${1:-./download}"', ""];
  for (const e of files(entries)) {
    const rel = relPath(e, rootUrl);
    lines.push(`rclone copyurl ${JSON.stringify(e.href)} "$DEST/${rel}" --create-empty-src-dirs`);
  }
  return lines.join("\n") + "\n";
}

function m3u(entries: DirEntry[]): string {
  const media = files(entries).filter((e) => e.category === "video" || e.category === "audio");
  const lines = ["#EXTM3U"];
  for (const e of media) {
    lines.push(`#EXTINF:-1,${e.name}`);
    lines.push(e.href);
  }
  return lines.join("\n") + "\n";
}

function json(entries: DirEntry[]): string {
  return JSON.stringify(
    files(entries).map((e) => ({
      name: e.name,
      url: e.href,
      size: e.size,
      modified: e.modified,
      category: e.category,
      status: e.status ?? "unknown",
    })),
    null,
    2
  );
}

function csv(entries: DirEntry[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = "name,url,bytes,size,modified,category,status";
  const rows = files(entries).map((e) =>
    [e.name, e.href, e.size ?? "", fmtSize(e.size), e.modified ?? "", e.category, e.status ?? "unknown"]
      .map((v) => esc(String(v)))
      .join(",")
  );
  return [head, ...rows].join("\n") + "\n";
}

function txt(entries: DirEntry[]): string {
  return files(entries).map((e) => e.href).join("\n") + "\n";
}

const EXT: Record<Exclude<ExportFormat, "zip">, { name: string; mime: string }> = {
  aria2: { name: "links.aria2.txt", mime: "text/plain" },
  "wget-i": { name: "links.wget.txt", mime: "text/plain" },
  "wget-r": { name: "fetch.wget.sh", mime: "text/x-shellscript" },
  jdownloader: { name: "links.crawljob", mime: "application/json" },
  rclone: { name: "fetch.rclone.sh", mime: "text/x-shellscript" },
  m3u8: { name: "playlist.m3u8", mime: "application/vnd.apple.mpegurl" },
  json: { name: "listing.json", mime: "application/json" },
  csv: { name: "listing.csv", mime: "text/csv" },
  txt: { name: "links.txt", mime: "text/plain" },
};

export function buildExport(format: Exclude<ExportFormat, "zip">, entries: DirEntry[], rootUrl: string): ExportOutput {
  let content: string;
  switch (format) {
    case "aria2": content = aria2(entries, rootUrl); break;
    case "wget-i": content = wgetInput(entries); break;
    case "wget-r": content = wgetRecursive(rootUrl); break;
    case "jdownloader": content = jdownloader(entries, rootUrl); break;
    case "rclone": content = rclone(entries, rootUrl); break;
    case "m3u8": content = m3u(entries); break;
    case "json": content = json(entries); break;
    case "csv": content = csv(entries); break;
    case "txt": content = txt(entries); break;
  }
  const meta = EXT[format];
  return { filename: meta.name, mime: meta.mime, content };
}

export interface ZipGuard {
  totalBytes: number;
  count: number;
  exceeds: boolean;
}

export function evaluateZipGuard(entries: DirEntry[], warnBytes: number, warnCount: number): ZipGuard {
  const fs = files(entries);
  const totalBytes = fs.reduce((a, e) => a + (e.size ?? 0), 0);
  return { totalBytes, count: fs.length, exceeds: totalBytes > warnBytes || fs.length > warnCount };
}
