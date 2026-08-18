// Icon path data (ported from the design) + extension -> category mapping.
import type { FileCategory } from "./types";

/** SVG path `d` strings, drawn inside a 24x24 viewBox. */
export const ICON_PATHS: Record<string, string> = {
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  image: "M4 5h16v14H4z M4 16l4-4 4 4 3-3 5 5 M8.5 9.5a1 1 0 1 0 0-.01",
  video: "M3 6h12v12H3z M15 9l6-3v12l-6-3z",
  audio: "M9 18V6l10-2v11 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 15a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  archive: "M6 3h12v18H6z M10 3v3 M14 6v3 M10 9v3 M11 12h2v4h-2z",
  pdf: "M7 3h8l4 4v14H7z M15 3v4h4 M10 13h1.5a1.5 1.5 0 0 1 0 3H10zm0 0v5",
  doc: "M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 15h6 M10 18h4",
  code: "M7 3h8l4 4v14H7z M15 3v4h4 M10.5 12l-2 2 2 2 M13.5 12l2 2-2 2",
  config: "M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 15h6 M10 18h3",
  app: "M7 3h8l4 4v14H7z M15 3v4h4 M10 14h4v4h-4z",
  unknown: "M7 3h8l4 4v14H7z M15 3v4h4",
};

/** Category accent tints (ported from the design). */
export const CATEGORY_TINT: Record<FileCategory, string> = {
  folder: "#c9b27f",
  image: "#84b39a",
  video: "#b192b2",
  audio: "#8a9bc4",
  archive: "#c29a8a",
  pdf: "#c48a8a",
  doc: "#9aa2ac",
  code: "#84b0bd",
  config: "#c9c07f",
  app: "#a7b884",
  unknown: "#9aa2ac",
};

/** Which icon key renders a given category. */
export const CATEGORY_ICON: Record<FileCategory, string> = {
  folder: "folder",
  image: "image",
  video: "video",
  audio: "audio",
  archive: "archive",
  pdf: "pdf",
  doc: "doc",
  code: "code",
  config: "config",
  app: "app",
  unknown: "unknown",
};

const EXT_MAP: Record<string, FileCategory> = {};
const add = (cat: FileCategory, exts: string[]) => exts.forEach((e) => (EXT_MAP[e] = cat));

add("video", ["mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "m2ts", "3gp"]);
add("audio", ["mp3", "flac", "wav", "aac", "ogg", "oga", "opus", "m4a", "wma", "aiff", "alac"]);
add("image", ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tif", "tiff", "heic", "avif", "ico", "raw", "cr2", "nef"]);
add("archive", ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "zst", "lz", "lzma", "cab", "iso", "dmg"]);
add("pdf", ["pdf"]);
add("doc", ["txt", "md", "rtf", "doc", "docx", "odt", "xls", "xlsx", "ods", "ppt", "pptx", "csv", "tsv", "epub", "log"]);
add("code", ["js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "c", "h", "cpp", "hpp", "cs", "java", "kt", "php", "sh", "bash", "zsh", "ps1", "sql", "html", "htm", "css", "scss", "vue", "svelte"]);
add("config", ["env", "ini", "conf", "cfg", "toml", "yaml", "yml", "json", "xml", "properties", "lock", "pem", "key", "crt", "htpasswd", "htaccess"]);
add("app", ["exe", "msi", "apk", "app", "deb", "rpm", "appimage", "bin", "run", "jar"]);

/** Filenames (lowercased) that map to a category regardless of extension. */
const NAME_MAP: Record<string, FileCategory> = {
  ".env": "config",
  ".gitignore": "config",
  dockerfile: "config",
  makefile: "code",
  ".htaccess": "config",
  ".htpasswd": "config",
};

export function categorize(name: string, isDir: boolean): { category: FileCategory; ext: string } {
  if (isDir) return { category: "folder", ext: "" };
  const lower = name.toLowerCase();
  if (NAME_MAP[lower]) return { category: NAME_MAP[lower], ext: lower.replace(/^\./, "") };
  // Handle dotfiles like ".env.production" and multi-part like "a.tar.gz".
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  if (lower.startsWith(".env")) return { category: "config", ext };
  return { category: EXT_MAP[ext] ?? "unknown", ext };
}
