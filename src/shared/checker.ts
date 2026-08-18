// Broken / empty / unreachable link detection.
// Strategy: HEAD first; if the server rejects HEAD, fall back to a 1-byte
// ranged GET so we never download whole files just to check them.
import type { LinkStatus } from "./types";

function withTimeout(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  external?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

function classify(status: number, contentLength: string | null): LinkStatus {
  if (status >= 400) return "broken";
  if (contentLength != null && Number(contentLength) === 0) return "empty";
  return "ok";
}

export async function checkLink(url: string, timeoutMs = 10000, external?: AbortSignal): Promise<LinkStatus> {
  // 1) HEAD
  {
    const { signal, done } = withTimeout(timeoutMs, external);
    try {
      const res = await fetch(url, { method: "HEAD", signal, credentials: "omit", redirect: "follow" });
      if (res.status !== 405 && res.status !== 501) {
        return classify(res.status, res.headers.get("content-length"));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return "unreachable";
      // fall through to GET
    } finally {
      done();
    }
  }
  // 2) Ranged GET (0-0)
  {
    const { signal, done } = withTimeout(timeoutMs, external);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal,
        credentials: "omit",
        redirect: "follow",
      });
      if (res.status >= 400) return "broken";
      // Total size from Content-Range "bytes 0-0/N" when present.
      const cr = res.headers.get("content-range");
      const total = cr ? Number(cr.split("/")[1]) : NaN;
      if (Number.isFinite(total)) return total === 0 ? "empty" : "ok";
      const cl = res.headers.get("content-length");
      if (cl != null && Number(cl) === 0) return "empty";
      return "ok";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "unreachable";
      return "unreachable";
    } finally {
      done();
    }
  }
}

// ---- Passive hidden-file probing ----

// "found"      2xx — the file is publicly reachable.
// "protected"  401/403 — the file exists but access is denied (still notable).
// "missing"    404/410 or other 4xx/5xx — nothing there.
// "error"      network failure / timeout — inconclusive.
export type ProbeResult = "found" | "protected" | "missing" | "error";

function classifyProbe(status: number): ProbeResult {
  if (status >= 200 && status < 400) return "found";
  if (status === 401 || status === 403) return "protected";
  return "missing";
}

export async function probe(url: string, timeoutMs = 8000, external?: AbortSignal): Promise<ProbeResult> {
  // HEAD first.
  {
    const { signal, done } = withTimeout(timeoutMs, external);
    try {
      const res = await fetch(url, { method: "HEAD", signal, credentials: "omit", redirect: "follow" });
      if (res.status !== 405 && res.status !== 501) return classifyProbe(res.status);
    } catch (e) {
      if ((e as Error).name === "AbortError") return "error";
    } finally {
      done();
    }
  }
  // Ranged GET fallback for servers that reject HEAD.
  {
    const { signal, done } = withTimeout(timeoutMs, external);
    try {
      const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal, credentials: "omit", redirect: "follow" });
      return classifyProbe(res.status);
    } catch {
      return "error";
    } finally {
      done();
    }
  }
}

/** Probe many candidate URLs with a concurrency pool. */
export async function probeAll(
  urls: string[],
  concurrency: number,
  timeoutMs: number,
  onResult: (url: string, result: ProbeResult) => void,
  external?: AbortSignal
): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < urls.length && !external?.aborted) {
      const url = urls[i++];
      onResult(url, await probe(url, timeoutMs, external));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

/** Check many URLs with a concurrency pool. */
export async function checkLinks(
  urls: string[],
  concurrency: number,
  timeoutMs: number,
  onResult: (url: string, status: LinkStatus) => void,
  external?: AbortSignal
): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < urls.length && !external?.aborted) {
      const url = urls[i++];
      const status = await checkLink(url, timeoutMs, external);
      onResult(url, status);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}
