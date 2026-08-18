# Open Directory Explorer

Firefox extension. Replaces bare open-directory listings (Apache, nginx, IIS,
Caddy, `python -m http.server`, lighttpd, h5ai) with a real file browser.

Opens automatically on directory listings. Turn it off in `about:addons`.

## Features

- Search, sort, multi-select, click to open.
- Recursive crawl — depth / concurrency / throttle, pause / cancel, cached, reset button.
- Highlight rules (exact / glob / regex / extension → fill / outline / badge / icon), edited in-page.
- Passive hidden-file probe — checks a list of names you configure (`.env`, `config.yml`, `.git/config`, …) by direct URL, also on non-listing pages.
- Broken / empty / unreachable check (HEAD, ranged GET fallback).
- Export: aria2, `wget -i` / `-r`, JDownloader, rclone, m3u8, JSON / CSV / TXT, ZIP. Copy links, open in tabs, download with folder structure.
- Virtualized list for large directories.
- RU / EN (auto by browser language).
- No external requests, no telemetry. Same-origin only.

## Build

```bash
npm install
npm run build
```

Output goes to `dist/`.

## Run (dev)

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `dist/manifest.json`.
Temporary add-ons are removed on restart.

## Stack

TypeScript + esbuild. One runtime dependency: JSZip.

## Layout

```
src/shared     parser adapters, crawler, checker, exporter, highlighter, storage, i18n
src/content    detection + injected UI
src/background  downloads, ZIP worker orchestration
src/popup      manual activation
src/options    full settings page
src/workers    ZIP worker
```

## Permissions

`storage`, `downloads`, `activeTab`, `scripting`, host access (needed to read
subdirectories during crawl). Fetches only the site you're on.
