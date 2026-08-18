// Settings persistence on browser.storage.local, with defaults + change events.
import type { Settings, HighlightRule, ScanPath } from "./types";
import { ACCENT_OPTIONS } from "./design";

const KEY = "settings";

export const DEFAULT_RULES: HighlightRule[] = [
  { id: "r-env", enabled: true, kind: "glob", value: ".env*", action: "badge", color: "#e08a8a", badgeLabel: "sensitive", priority: 0 },
  { id: "r-git", enabled: true, kind: "glob", value: ".git*", action: "badge", color: "#e08a8a", badgeLabel: "sensitive", priority: 1 },
  { id: "r-config", enabled: true, kind: "glob", value: "config.*", action: "outline", color: "#d6a878", priority: 2 },
  { id: "r-archive", enabled: true, kind: "ext", value: "zip", action: "tint", color: "#8a9bc4", priority: 3 },
  { id: "r-video", enabled: true, kind: "ext", value: "mp4", action: "tint", color: "#84b39a", priority: 4 },
];

export const DEFAULT_SCAN_PATHS: ScanPath[] = [
  { value: ".env", risk: "critical", note: "Переменные окружения — креды в открытом виде", enabled: true },
  { value: ".env.production", risk: "critical", note: "Прод-креды: STRIPE_SECRET, JWT_SECRET…", enabled: true },
  { value: ".env.local", risk: "critical", note: "Локальные секреты", enabled: true },
  { value: "config.php", risk: "high", note: "mysql креды в открытом виде", enabled: true },
  { value: "wp-config.php", risk: "high", note: "WordPress — DB и соль", enabled: true },
  { value: "config.yml", risk: "high", note: "Конфиг приложения", enabled: true },
  { value: "config.json", risk: "high", note: "Конфиг приложения", enabled: true },
  { value: ".git/config", risk: "medium", note: "remote origin + возможный токен", enabled: true },
  { value: ".git/HEAD", risk: "medium", note: "Дерево git доступно — можно выкачать репозиторий", enabled: true },
  { value: ".htpasswd", risk: "critical", note: "Хэши паролей basic-auth", enabled: true },
  { value: ".DS_Store", risk: "medium", note: "Список файлов каталога (macOS)", enabled: true },
  { value: "backup.sql", risk: "high", note: "Дамп базы", enabled: true },
  { value: "docker-compose.yml", risk: "medium", note: "Сервисы и переменные окружения", enabled: false },
  { value: ".aws/credentials", risk: "critical", note: "Ключи AWS", enabled: false },
  { value: "phpinfo.php", risk: "medium", note: "Раскрытие конфигурации PHP", enabled: false },
];

export const DEFAULT_SETTINGS: Settings = {
  lang: "auto",
  rules: DEFAULT_RULES,
  crawl: { depth: 1, concurrency: 6, throttleMs: 0, timeoutMs: 15000, checkLinks: false, probePerDir: false, probePerDirMax: 3 },
  scanner: { enabled: true, concurrency: 4, timeoutMs: 8000, paths: DEFAULT_SCAN_PATHS },
  theme: { accent: ACCENT_OPTIONS[0], density: "comfortable", showFileIcons: true },
  categoryIcons: {},
  export: { defaultFormat: "aria2", zipWarnBytes: 2 * 1024 ** 3, zipWarnCount: 500 },
};

function mergeDefaults(partial: Partial<Settings> | undefined): Settings {
  const s = partial ?? {};
  return {
    lang: s.lang ?? DEFAULT_SETTINGS.lang,
    rules: s.rules ?? DEFAULT_SETTINGS.rules,
    crawl: { ...DEFAULT_SETTINGS.crawl, ...(s.crawl ?? {}) },
    scanner: { ...DEFAULT_SETTINGS.scanner, ...(s.scanner ?? {}), paths: s.scanner?.paths ?? DEFAULT_SETTINGS.scanner.paths },
    theme: { ...DEFAULT_SETTINGS.theme, ...(s.theme ?? {}) },
    categoryIcons: { ...DEFAULT_SETTINGS.categoryIcons, ...(s.categoryIcons ?? {}) },
    export: { ...DEFAULT_SETTINGS.export, ...(s.export ?? {}) },
  };
}

export async function getSettings(): Promise<Settings> {
  const got = await browser.storage.local.get(KEY);
  return mergeDefaults(got[KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(s: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: s });
}

/** Subscribe to settings changes; returns an unsubscribe function. */
export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, browser.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[KEY]) cb(mergeDefaults(changes[KEY].newValue as Partial<Settings>));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
