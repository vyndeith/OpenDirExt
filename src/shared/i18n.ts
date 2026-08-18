// Minimal i18n. Auto-detects ru/en from the browser UI language; can be
// overridden via settings. t("key", ...args) interpolates {0}, {1}, …
export type Lang = "en" | "ru";
export type LangSetting = "auto" | Lang;

function detect(): Lang {
  try {
    const ui = (browser?.i18n?.getUILanguage?.() || navigator.language || "en").toLowerCase();
    return ui.startsWith("ru") ? "ru" : "en";
  } catch {
    return (navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
  }
}

let current: Lang = detect();

export function setLang(l: LangSetting): void {
  current = l === "auto" ? detect() : l;
}
export function getLang(): Lang {
  return current;
}

type Entry = { en: string; ru: string };

const DICT: Record<string, Entry> = {
  rules: { en: "Rules", ru: "Правила" },
  search_ph: { en: "Search files…", ru: "Поиск файлов…" },
  crawl_title: { en: "Recursive crawl", ru: "Рекурсивный обход" },
  depth_0: { en: "0 · current", ru: "0 · текущая" },
  depth_1: { en: "1 level", ru: "1 уровень" },
  depth_2: { en: "2 levels", ru: "2 уровня" },
  depth_3: { en: "3 levels", ru: "3 уровня" },
  depth_inf: { en: "∞ (careful)", ru: "∞ (осторожно)" },
  hidden_in_folders: { en: "hidden in folders", ru: "скрытые в папках" },
  hidden_in_folders_title: { en: "Probe up to {0} hidden files in each folder while crawling", ru: "Пробить до {0} скрытых файла в каждой папке при обходе" },
  crawl_go: { en: "Crawl", ru: "Обойти" },
  crawl_refresh: { en: "Refresh", ru: "Обновить" },
  crawl_reset: { en: "Reset", ru: "Сбросить" },
  toast_reset: { en: "Reset to current directory", ru: "Сброшено до текущей папки" },
  toast_reset_sub: { en: "{0} entries in this folder", ru: "{0} записей в этой папке" },
  crawl_progress: { en: "{0} dirs · {1} files · {2} errors", ru: "{0} папок · {1} файлов · {2} ошибок" },
  crawl_start: { en: "starting…", ru: "старт…" },
  resume: { en: "Resume", ru: "Продолжить" },
  pause: { en: "Pause", ru: "Пауза" },
  cancel: { en: "Cancel", ru: "Отмена" },
  check_broken: { en: "Check broken", ru: "Проверить битые" },
  col_name: { en: "Name", ru: "Название" },
  col_modified: { en: "Modified", ru: "Изменён" },
  col_size: { en: "Size", ru: "Размер" },
  col_type: { en: "Type", ru: "Тип" },
  badge_hidden: { en: "hidden", ru: "скрытый" },
  open_folder: { en: "Open folder", ru: "Открыть папку" },
  open_file: { en: "Open file in a new tab", ru: "Открыть файл в новой вкладке" },
  select: { en: "Select", ru: "Выбрать" },
  items: { en: "{0} items", ru: "{0} элементов" },
  selected: { en: "selected", ru: "выбрано" },
  clear: { en: "Clear", ru: "Снять" },
  copy: { en: "Copy", ru: "Копировать" },
  tabs: { en: "Tabs", ru: "Вкладки" },
  download: { en: "Download ▾", ru: "Скачать ▾" },
  exp_files: { en: "File", ru: "Файл" },
  exp_zip: { en: "ZIP archive", ru: "ZIP-архив" },
  exp_aria2: { en: "aria2 input-file", ru: "aria2 input-file" },
  exp_wget_i: { en: "wget -i (list)", ru: "wget -i (список)" },
  exp_wget_r: { en: "wget -r (script)", ru: "wget -r (скрипт)" },
  exp_jd: { en: "JDownloader .crawljob", ru: "JDownloader .crawljob" },
  exp_rclone: { en: "rclone script", ru: "rclone скрипт" },
  exp_m3u: { en: ".m3u8 playlist", ru: "Плейлист .m3u8" },
  exp_json: { en: "JSON", ru: "JSON" },
  exp_csv: { en: "CSV", ru: "CSV" },
  exp_txt: { en: "TXT (links)", ru: "TXT (ссылки)" },

  toast_cache_title: { en: "Loaded from cache", ru: "Загружено из кэша" },
  toast_cache_sub: { en: '{0} entries · press "Refresh" for fresh data', ru: "{0} записей · нажми «Обновить» для свежих данных" },
  toast_crawl_done: { en: "Crawl finished", ru: "Обход завершён" },
  toast_crawl_done_sub: { en: "{0} entries found", ru: "{0} записей найдено" },
  toast_crawl_err: { en: "Crawl error", ru: "Ошибка обхода" },
  toast_check: { en: "Checking links", ru: "Проверка ссылок" },
  toast_check_sub: { en: "{0} files…", ru: "{0} файлов…" },
  toast_dl_started: { en: "Download started", ru: "Скачивание запущено" },
  toast_error: { en: "Error", ru: "Ошибка" },
  toast_files_n: { en: "{0} files", ru: "{0} файлов" },
  toast_list_saved: { en: "List saved", ru: "Список сохранён" },
  toast_zip_building: { en: "Building ZIP…", ru: "Сборка ZIP…" },
  toast_zip_building_sub: { en: "{0} files — downloading and packing", ru: "{0} файлов — идёт загрузка и упаковка" },
  toast_zip_ready: { en: "ZIP ready", ru: "ZIP готов" },
  toast_zip_err: { en: "ZIP error", ru: "Ошибка ZIP" },
  toast_copied: { en: "Copied", ru: "Скопировано" },
  toast_copied_sub: { en: "{0} links on the clipboard", ru: "{0} ссылок в буфере" },
  toast_copy_fail: { en: "Copy failed", ru: "Не удалось скопировать" },
  toast_copy_fail_sub: { en: "The browser blocked clipboard access", ru: "Браузер заблокировал доступ к буферу" },
  toast_opened_tabs: { en: "Opened in tabs", ru: "Открыто во вкладках" },
  toast_hidden_found: { en: "{0} hidden files found", ru: "{0} скрытых файла найдено" },
  toast_hidden_found_sub: { en: "Reachable by direct link — open now", ru: "Доступны по прямой ссылке — открой сразу" },

  zip_confirm: {
    en: "Selected {0} files, {1}.\nZIP is assembled in memory — this can freeze the browser.\n\nOK — build the ZIP anyway.\nCancel — export a list for a download manager instead.",
    ru: "Выбрано {0} файлов на {1}.\nZIP собирается в память — это может подвесить браузер.\n\nOK — всё равно собрать ZIP.\nОтмена — лучше экспортировать список для менеджера загрузок.",
  },

  modal_title: { en: "Extension settings", ru: "Настройки расширения" },
  modal_sub: { en: "File highlight rules", ru: "Правила подсветки файлов" },
  rules_section: { en: "Highlight rules", ru: "Правила подсветки" },
  add_rule: { en: "Add rule", ru: "Добавить правило" },
  rule_ph_ext: { en: "e.g. sql, zip", ru: "напр. sql, zip" },
  rule_ph_regex: { en: "e.g. ^backup_\\d+", ru: "напр. ^backup_\\d+" },
  rule_ph_glob: { en: "e.g. .env* or config.*", ru: "напр. .env* или config.*" },
  rule_ph_exact: { en: "exact file name", ru: "точное имя файла" },
  kind_ext: { en: "Ext", ru: "Расшир." },
  kind_glob: { en: "Glob", ru: "Glob" },
  kind_regex: { en: "RegExp", ru: "RegExp" },
  kind_exact: { en: "Name", ru: "Имя" },
  act_tint: { en: "Fill", ru: "Заливка" },
  act_outline: { en: "Outline", ru: "Обводка" },
  act_badge: { en: "Badge", ru: "Бейдж" },
  act_icon: { en: "Icon", ru: "Иконка" },
  badge_text_ph: { en: "badge text", ru: "текст бейджа" },
  enabled: { en: "Enabled", ru: "Включено" },
  lang_label: { en: "Language", ru: "Язык" },
  lang_auto: { en: "Auto", ru: "Авто" },
  hidden_files_section: { en: "Hidden files to probe", ru: "Скрытые файлы для поиска" },
  hidden_files_ph: { en: "file name, then Enter", ru: "имя файла, затем Enter" },
  scan_enable_short: { en: "Passive scan", ru: "Пассивный поиск" },

  scan_scanning: { en: "Scanning directory…", ru: "Сканирование каталога…" },
  scan_sub_scanning: { en: "Passive hidden-file scan", ru: "Пассивный поиск скрытых файлов" },
  scan_found_title: { en: "{0} sensitive files found", ru: "{0} чувствительных файла обнаружено" },
  scan_sub_done: { en: "Reachable by direct link — some aren't indexed by the server", ru: "Открыты по прямой ссылке — часть не индексируется сервером" },
  scan_hide: { en: "Hide ({0})", ru: "Скрыть ({0})" },
  scan_show: { en: "Show ({0})", ru: "Показать ({0})" },
  src_hidden: { en: "hidden", ru: "скрытый" },
  src_listed: { en: "listed", ru: "в списке" },
  scan_open: { en: "Open", ru: "Открыть" },
  hidden_note_fallback: { en: "Hidden file (found while crawling)", ru: "Скрытый файл (найден при обходе)" },

  sens_env: { en: "Environment variables — plaintext credentials", ru: "Переменные окружения — креды в открытом виде" },
  sens_key: { en: "Secret key / credentials", ru: "Секретный ключ / учётные данные" },
  sens_config: { en: "Application config", ru: "Конфиг приложения" },
  sens_dump: { en: "Dump / backup", ru: "Дамп / бэкап" },
  sens_git: { en: "Git repository data", ru: "Данные git-репозитория" },

  flash_prefix: { en: "Open Directory Explorer", ru: "Open Directory Explorer" },
  flash_not_listing: { en: "this doesn't look like a directory listing.", ru: "это не похоже на файловый листинг." },
  flash_no_entries: { en: "couldn't extract entries.", ru: "не удалось извлечь записи." },
  flash_no_paths: { en: "no enabled paths to probe.", ru: "нет включённых путей для поиска." },
  flash_nothing: { en: "no hidden files found.", ru: "скрытых файлов не найдено." },

  popup_open: { en: "Open in Explorer", ru: "Открыть в Explorer" },
  popup_options: { en: "Settings & rules", ru: "Настройки и правила" },
  popup_hint: {
    en: "On open-directory pages the Explorer opens automatically. The button above is a manual run (incl. passive hidden-file scan on a normal page). To turn it off, disable the add-on in about:addons.",
    ru: "На open-directory страницах Explorer открывается автоматически. Кнопка выше — ручной запуск (в т.ч. пассивный поиск скрытых файлов на обычной странице). Чтобы выключить — отключи аддон в about:addons.",
  },
  popup_here_disabled: { en: "Not available here — open an http(s) or file:// listing.", ru: "Здесь расширение не работает — открой http(s) или file:// листинг." },
  popup_error: { en: "Error: ", ru: "Ошибка: " },

  // Options page
  opt_match: { en: "Matching", ru: "Совпадение" },
  opt_action: { en: "Action", ru: "Действие" },
  opt_color: { en: "Color", ru: "Цвет" },
  opt_on: { en: "On", ru: "Вкл" },
  opt_no_match: { en: "no match", ru: "нет совпадений" },
  opt_bad_json: { en: "Invalid JSON", ru: "Некорректный JSON" },
  opt_rules_hint: { en: "Applied in the list and in crawl results. Order = priority.", ru: "Применяются в списке и в результатах обхода. Порядок = приоритет." },
  opt_add_rule: { en: "+ Add rule", ru: "+ Добавить правило" },
  opt_preview: { en: "Preview — file name", ru: "Предпросмотр — имя файла" },
  opt_export_rules: { en: "Export rules", ru: "Экспорт правил" },
  opt_import_rules: { en: "Import rules", ru: "Импорт правил" },
  opt_crawl_defaults: { en: "Crawl defaults", ru: "Обход по умолчанию" },
  opt_depth: { en: "Depth (∞ = 999)", ru: "Глубина (∞ = 999)" },
  opt_concurrency: { en: "Concurrency", ru: "Конкурентность" },
  opt_throttle: { en: "Throttle, ms", ru: "Throttle, мс" },
  opt_timeout: { en: "Timeout, ms", ru: "Таймаут, мс" },
  opt_check_links: { en: "Check broken / empty links while crawling", ru: "Проверять битые/пустые ссылки при обходе" },
  opt_live_results: { en: "Show found entries in real time during crawl", ru: "Показывать найденное в реальном времени при обходе" },
  opt_probe_per_dir: { en: "Probe hidden files in every crawled folder", ru: "Пробивать скрытые файлы в каждой папке при обходе" },
  opt_probe_max: { en: "Max files/folder", ru: "Макс. файлов/папку" },
  opt_theme: { en: "Theme & view", ru: "Тема и вид" },
  opt_accent: { en: "Accent", ru: "Акцент" },
  opt_density: { en: "Density", ru: "Плотность" },
  opt_comfortable: { en: "Comfortable", ru: "Просторно" },
  opt_compact: { en: "Compact", ru: "Компактно" },
  opt_file_icons: { en: "File icons", ru: "Иконки файлов" },
  opt_export_defaults: { en: "Export defaults", ru: "Экспорт по умолчанию" },
  opt_format: { en: "Format", ru: "Формат" },
  opt_zip_mb: { en: "ZIP threshold, MB", ru: "Порог ZIP, МБ" },
  opt_zip_files: { en: "ZIP threshold, files", ru: "Порог ZIP, файлов" },
  opt_all_settings: { en: "All settings", ru: "Все настройки" },
  opt_export_settings: { en: "Export settings", ru: "Экспорт настроек" },
  opt_import_settings: { en: "Import settings", ru: "Импорт настроек" },
  opt_reset: { en: "Reset to defaults", ru: "Сбросить к дефолту" },
  opt_reset_confirm: { en: "Reset all settings?", ru: "Сбросить все настройки?" },
  risk_critical: { en: "critical", ru: "критично" },
  risk_high: { en: "high", ru: "высокий" },
  risk_medium: { en: "medium", ru: "средний" },
  opt_scan_ph: { en: "e.g. config.yml or .git/config", ru: "напр. config.yml или .git/config" },
  opt_scanner_title: { en: "Passive hidden-file scan", ru: "Пассивный поиск скрытых файлов" },
  opt_scanner_hint: { en: "Checks files by direct link relative to the current path — even if they aren't in the listing.", ru: "Проверяет наличие файлов по прямой ссылке относительно текущего пути — даже если их нет в листинге." },
  opt_scanner_enable: { en: "Enable passive scan", ru: "Включить пассивный поиск" },
  opt_add_path: { en: "+ Add path", ru: "+ Добавить путь" },
  opt_cat_icons: { en: "Category icons", ru: "Иконки категорий" },
  opt_up: { en: "Up", ru: "Выше" },
  opt_down: { en: "Down", ru: "Ниже" },
  opt_badge_label: { en: "Badge text", ru: "Текст бейджа" },
  opt_lang: { en: "Interface language", ru: "Язык интерфейса" },
};

export function t(key: string, ...args: (string | number)[]): string {
  const entry = DICT[key];
  let s = entry ? entry[current] : key;
  args.forEach((a, i) => (s = s.replace("{" + i + "}", String(a))));
  return s;
}
