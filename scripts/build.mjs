// Build script for the extension.
//
// The ТЗ suggests Vite or web-ext. This project is a multi-target MV3 extension
// (content script + event page + worker + two HTML pages), which needs several
// standalone IIFE bundles with fixed, non-hashed names — a job Vite's HTML-centric
// pipeline fights. esbuild does it directly with a single dev dependency and full
// control over output names/formats, so we use it here. `web-ext` is still used
// (optionally) for run/lint/sign — see README.

import { build, context } from "esbuild";
import { cp, mkdir, rm, readdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, "dist");
const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");

/** Each entry becomes one standalone file in dist/. */
const entries = {
  content: "src/content/index.ts",
  background: "src/background/index.ts",
  popup: "src/popup/popup.ts",
  options: "src/options/options.ts",
  "zip.worker": "src/workers/zip.worker.ts",
};

/** Static files copied verbatim into dist/. */
const staticFiles = [
  "manifest.json",
  "src/popup/popup.html",
  "src/options/options.html",
];

const common = {
  bundle: true,
  format: "iife",
  target: ["firefox115"],
  platform: "browser",
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  legalComments: "none",
};

async function copyStatic() {
  await mkdir(outdir, { recursive: true });
  for (const f of staticFiles) {
    const base = path.basename(f);
    await cp(path.join(root, f), path.join(outdir, base));
  }
  await cp(path.join(root, "icons"), path.join(outdir, "icons"), { recursive: true });
}

async function makeZip() {
  // Zip dist/ into web-ext-artifacts/ using the system zip if available.
  const artifacts = path.join(root, "web-ext-artifacts");
  await mkdir(artifacts, { recursive: true });
  const out = path.join(artifacts, "open-directory-explorer.zip");
  await rm(out, { force: true });
  const r = spawnSync("zip", ["-r", "-FS", out, "."], { cwd: outdir, stdio: "inherit" });
  if (r.error) {
    console.error("`zip` not found — install it or run `web-ext build`. dist/ is ready to load unpacked.");
  } else {
    console.log("Packaged:", path.relative(root, out));
  }
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await copyStatic();

  const buildOpts = Object.entries(entries).map(([name, entry]) => ({
    ...common,
    entryPoints: [path.join(root, entry)],
    outfile: path.join(outdir, `${name}.js`),
  }));

  if (watch) {
    const ctxs = await Promise.all(buildOpts.map((o) => context(o)));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("watching for changes…");
  } else {
    await Promise.all(buildOpts.map((o) => build(o)));
    console.log("Build complete →", path.relative(root, outdir));
    if (zip) await makeZip();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
