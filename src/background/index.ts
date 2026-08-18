// Background event page: owns long-running crawls, link checks, exports and
// downloads. Fetches here run with the host permission the user granted for the
// listing's origin.
import { startCrawl } from "../shared/crawler";
import { checkLinks, probeAll } from "../shared/checker";
import { buildExport, relPath } from "../shared/exporter";
import type { DirEntry } from "../shared/types";
import {
  CHECK_PORT,
  CRAWL_PORT,
  PROBE_PORT,
  type CheckClientMsg,
  type CheckServerMsg,
  type CrawlClientMsg,
  type CrawlServerMsg,
  type ProbeClientMsg,
  type ProbeServerMsg,
  type RpcRequest,
  type RpcResponse,
} from "../shared/messages";

// ---- Downloads (with object-URL cleanup) ----

const pendingRevokes = new Map<number, string>();
browser.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current === "complete" || delta.state?.current === "interrupted") {
    const url = pendingRevokes.get(delta.id);
    if (url) {
      URL.revokeObjectURL(url);
      pendingRevokes.delete(delta.id);
    }
  }
});

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const id = await browser.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false });
  pendingRevokes.set(id, url);
}

// ---- One-shot RPCs ----

async function handleRpc(req: RpcRequest): Promise<RpcResponse> {
  switch (req.type) {
    case "openOptions": {
      await browser.runtime.openOptionsPage();
      return { ok: true };
    }
    case "download": {
      for (const item of req.items) {
        await browser.downloads.download({ url: item.url, filename: item.filename, conflictAction: "uniquify", saveAs: false });
      }
      return { ok: true, note: `${req.items.length} downloads queued` };
    }
    case "openTabs": {
      const capped = req.urls.slice(0, 25);
      for (const url of capped) await browser.tabs.create({ url, active: false });
      return { ok: true, note: `${capped.length} tabs opened` };
    }
    case "export:list": {
      const out = buildExport(req.format, req.entries, req.rootUrl);
      await downloadBlob(new Blob([out.content], { type: out.mime }), out.filename);
      return { ok: true, note: out.filename };
    }
    case "export:zip": {
      const blob = await buildZip(req.entries.filter((e) => !e.isDir), req.rootUrl);
      const host = safeHost(req.rootUrl);
      await downloadBlob(blob, `${host}.zip`);
      return { ok: true, note: `${host}.zip` };
    }
  }
}

browser.runtime.onMessage.addListener((message) => {
  // Returning a promise makes this an async responder.
  return handleRpc(message as RpcRequest).catch((e) => ({ ok: false, error: (e as Error).message } as RpcResponse));
});

function safeHost(url: string): string {
  try {
    return new URL(url).hostname || "download";
  } catch {
    return "download";
  }
}

// ---- ZIP via worker ----

function buildZip(files: DirEntry[], rootUrl: string): Promise<Blob> {
  const list = files.map((f) => ({ url: f.href, path: relPath(f, rootUrl) }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(browser.runtime.getURL("zip.worker.js"));
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { type: string; blob?: Blob; error?: string };
      if (m.type === "done" && m.blob) {
        resolve(m.blob);
        worker.terminate();
      } else if (m.type === "error") {
        reject(new Error(m.error));
        worker.terminate();
      }
    };
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage({ type: "zip", files: list });
  });
}

// ---- Crawl port ----

browser.runtime.onConnect.addListener((port) => {
  if (port.name === CRAWL_PORT) handleCrawlPort(port);
  else if (port.name === CHECK_PORT) handleCheckPort(port);
  else if (port.name === PROBE_PORT) handleProbePort(port);
});

function handleCrawlPort(port: browser.runtime.Port): void {
  let handle: ReturnType<typeof startCrawl> | null = null;
  const send = (m: CrawlServerMsg) => {
    try {
      port.postMessage(m);
    } catch {
      /* port closed */
    }
  };
  port.onMessage.addListener((raw) => {
    const msg = raw as CrawlClientMsg;
    if (msg.kind === "start") {
      handle = startCrawl(
        msg.root,
        msg.opts,
        (progress) => send({ kind: "progress", progress }),
        (entries) => send({ kind: "batch", entries })
      );
      handle.promise
        .then((entries) => send({ kind: "done", entries }))
        .catch((e) => send({ kind: "error", error: (e as Error).message }));
    } else if (msg.kind === "pause") handle?.pause();
    else if (msg.kind === "resume") handle?.resume();
    else if (msg.kind === "cancel") handle?.cancel();
  });
  port.onDisconnect.addListener(() => handle?.cancel());
}

function handleProbePort(port: browser.runtime.Port): void {
  const abort = new AbortController();
  const send = (m: ProbeServerMsg) => {
    try {
      port.postMessage(m);
    } catch {
      /* closed */
    }
  };
  port.onMessage.addListener((raw) => {
    const msg = raw as ProbeClientMsg;
    if (msg.kind === "start") {
      probeAll(
        msg.urls,
        msg.concurrency,
        msg.timeoutMs,
        (url, result) => send({ kind: "result", url, result }),
        abort.signal
      ).then(() => send({ kind: "done" }));
    } else if (msg.kind === "cancel") abort.abort();
  });
  port.onDisconnect.addListener(() => abort.abort());
}

function handleCheckPort(port: browser.runtime.Port): void {
  const abort = new AbortController();
  const send = (m: CheckServerMsg) => {
    try {
      port.postMessage(m);
    } catch {
      /* closed */
    }
  };
  port.onMessage.addListener((raw) => {
    const msg = raw as CheckClientMsg;
    if (msg.kind === "start") {
      checkLinks(
        msg.urls,
        msg.concurrency,
        msg.timeoutMs,
        (url, status) => send({ kind: "result", url, status }),
        abort.signal
      ).then(() => send({ kind: "done" }));
    } else if (msg.kind === "cancel") abort.abort();
  });
  port.onDisconnect.addListener(() => abort.abort());
}
