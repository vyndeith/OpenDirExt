// Core data model shared across content / background / popup / options.

export type FileCategory =
  | "folder"
  | "video"
  | "audio"
  | "image"
  | "archive"
  | "doc"
  | "pdf"
  | "code"
  | "config"
  | "app"
  | "unknown";

export type LinkStatus = "ok" | "broken" | "empty" | "unreachable" | "unknown";

/** Severity buckets used by the passive scanner card. */
export type RiskLevel = "critical" | "high" | "medium";

/** One configurable probe target for the passive hidden-file scanner. */
export interface ScanPath {
  value: string; // path relative to the current directory, e.g. ".env" or ".git/config"
  risk: RiskLevel;
  note: string;
  enabled: boolean;
}

export type ServerType =
  | "apache"
  | "nginx"
  | "iis"
  | "caddy"
  | "python"
  | "lighttpd"
  | "h5ai"
  | "generic";

/** One row in a directory listing (file or folder). */
export interface DirEntry {
  name: string; // decoded display name (no trailing slash)
  href: string; // absolute URL
  isDir: boolean;
  size: number | null; // bytes; best-effort, null when unknown
  sizeLabel: string | null; // raw size text when bytes could not be parsed
  modified: string | null; // raw modified text as shown by the server
  modifiedTs: number | null; // epoch ms when parseable
  category: FileCategory;
  ext: string; // lowercased extension without dot, or ""
  depth: number; // 0 for the directory the user opened
  parentHref: string; // href of the containing directory
  status?: LinkStatus; // filled in by the broken/empty checker
  childCount?: number | null; // populated during recursive crawl
  hidden?: boolean; // discovered by probing, not present in the listing
  risk?: RiskLevel; // severity when hidden/sensitive
}

export interface ListingParseResult {
  server: ServerType;
  origin: string;
  path: string; // decoded pathname of the listing
  entries: DirEntry[];
}

// ---- Highlight rules ----

export type MatchKind = "exact" | "glob" | "regex" | "ext";
export type HighlightAction = "tint" | "outline" | "badge" | "icon";

export interface HighlightRule {
  id: string;
  enabled: boolean;
  kind: MatchKind;
  value: string;
  action: HighlightAction;
  color: string;
  badgeLabel?: string;
  priority: number; // lower = applied first
}

// ---- Settings ----

export type ExportFormat =
  | "aria2"
  | "wget-i"
  | "wget-r"
  | "jdownloader"
  | "rclone"
  | "m3u8"
  | "json"
  | "csv"
  | "txt"
  | "zip";

export interface CrawlOptions {
  depth: number; // 0 = current dir only, Infinity for unbounded
  concurrency: number;
  throttleMs: number;
  timeoutMs: number;
  checkLinks: boolean;
  probePerDir: boolean; // also probe hidden files in every crawled directory
  probePerDirMax: number; // cap per directory (keep small to avoid 429)
  probePaths?: string[]; // enabled scan-path values, injected at crawl start
}

export interface ScannerSettings {
  enabled: boolean;
  concurrency: number;
  timeoutMs: number;
  paths: ScanPath[];
}

export interface Settings {
  lang: "auto" | "en" | "ru";
  rules: HighlightRule[];
  crawl: CrawlOptions;
  scanner: ScannerSettings;
  theme: {
    accent: string;
    density: "comfortable" | "compact";
    showFileIcons: boolean;
  };
  categoryIcons: Partial<Record<FileCategory, string>>; // category -> icon key override
  export: {
    defaultFormat: ExportFormat;
    zipWarnBytes: number;
    zipWarnCount: number;
  };
}
