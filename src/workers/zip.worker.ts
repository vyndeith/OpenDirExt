// ZIP assembly in a Worker (CPU-bound → off the main thread).
// Spawned by the background page, so fetches run with the extension's granted
// host permissions. Uses STORE (no recompression) since open-dir payloads are
// usually already-compressed media/archives.
import JSZip from "jszip";

interface ZipFile {
  path: string;
  url: string;
}
type InMsg = { type: "zip"; files: ZipFile[] };
type OutMsg =
  | { type: "progress"; done: number; total: number; failed: number }
  | { type: "done"; blob: Blob }
  | { type: "error"; error: string };

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (msg.type !== "zip") return;
  try {
    const zip = new JSZip();
    let done = 0;
    let failed = 0;
    const total = msg.files.length;
    // Fetch sequentially to bound memory; the network pool already ran upstream.
    for (const f of msg.files) {
      try {
        const res = await fetch(f.url, { credentials: "omit", redirect: "follow" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        zip.file(f.path, await res.blob());
      } catch {
        failed++;
      }
      done++;
      post({ type: "progress", done, total, failed });
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
      post({ type: "progress", done: total, total, failed });
      void meta;
    });
    post({ type: "done", blob });
  } catch (e) {
    post({ type: "error", error: (e as Error).message });
  }
};
