// Typed message protocol between content / background / popup / options.
// One-shot RPCs go over runtime.sendMessage; streaming crawl/check use Ports.
import type { CrawlOptions, DirEntry, ExportFormat, LinkStatus } from "./types";
import type { CrawlProgress } from "./crawler";
import type { ProbeResult } from "./checker";

export interface DownloadItem {
  url: string;
  filename: string; // may contain forward-slash subfolders
}

export type RpcRequest =
  | { type: "openOptions" }
  | { type: "download"; items: DownloadItem[] }
  | { type: "openTabs"; urls: string[] }
  | { type: "export:list"; format: Exclude<ExportFormat, "zip">; entries: DirEntry[]; rootUrl: string }
  | { type: "export:zip"; entries: DirEntry[]; rootUrl: string; warnBytes: number; warnCount: number };

export type RpcResponse =
  | { ok: true; note?: string }
  | { ok: false; error: string };

export async function sendBg(req: RpcRequest): Promise<RpcResponse> {
  return (await browser.runtime.sendMessage(req)) as RpcResponse;
}

// ---- Crawl port ----

export const CRAWL_PORT = "crawl";

export type CrawlClientMsg =
  | { kind: "start"; root: string; opts: CrawlOptions }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "cancel" };

export type CrawlServerMsg =
  | { kind: "progress"; progress: CrawlProgress }
  | { kind: "batch"; entries: DirEntry[] }
  | { kind: "done"; entries: DirEntry[] }
  | { kind: "error"; error: string };

// ---- Check port ----

export const CHECK_PORT = "check";

export type CheckClientMsg =
  | { kind: "start"; urls: string[]; concurrency: number; timeoutMs: number }
  | { kind: "cancel" };

export type CheckServerMsg =
  | { kind: "result"; url: string; status: LinkStatus }
  | { kind: "done" };

// ---- Passive hidden-file probe port ----

export const PROBE_PORT = "probe";

export type ProbeClientMsg =
  | { kind: "start"; urls: string[]; concurrency: number; timeoutMs: number }
  | { kind: "cancel" };

export type ProbeServerMsg =
  | { kind: "result"; url: string; result: ProbeResult }
  | { kind: "done" };
