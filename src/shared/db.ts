// IndexedDB cache for large crawl trees (keyed by origin+path).
// storage.local is used for settings; big entry arrays live here instead to
// avoid bloating the sync-serialized settings blob.
import type { DirEntry, ServerType } from "./types";

const DB_NAME = "ode-cache";
const STORE = "trees";
const VERSION = 1;

export interface CachedTree {
  key: string; // origin + pathname
  server: ServerType;
  createdAt: number;
  depth: number;
  entries: DirEntry[];
}

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const cacheKey = (origin: string, path: string) => origin + path;

export function getTree(key: string): Promise<CachedTree | undefined> {
  return tx<CachedTree | undefined>("readonly", (s) => s.get(key) as IDBRequest<CachedTree | undefined>);
}

export function putTree(tree: CachedTree): Promise<void> {
  return tx("readwrite", (s) => s.put(tree)).then(() => undefined);
}

export function deleteTree(key: string): Promise<void> {
  return tx("readwrite", (s) => s.delete(key)).then(() => undefined);
}

export function clearTrees(): Promise<void> {
  return tx("readwrite", (s) => s.clear()).then(() => undefined);
}
