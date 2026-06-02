/**
 * Tiny on-disk JSON key-value cache. One file per namespace under .cache/.
 * Keys are SHA-256 hex digests of the input text, so re-runs hit the cache and
 * cost no Anthropic tokens.
 *
 * Loaded into memory on first use; writes are flushed after each batch. Good
 * enough for an internal single-process tool.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "..", "..", ".cache");

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export class JsonCache<T> {
  private store: Record<string, T> = {};
  private readonly file: string;
  private loaded = false;

  constructor(namespace: string) {
    this.file = join(CACHE_DIR, `${namespace}.json`);
  }

  private ensureLoaded() {
    if (this.loaded) return;
    try {
      if (existsSync(this.file)) {
        this.store = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, T>;
      }
    } catch {
      this.store = {}; // corrupt cache -> start fresh rather than crash
    }
    this.loaded = true;
  }

  get(key: string): T | undefined {
    this.ensureLoaded();
    return this.store[key];
  }

  has(key: string): boolean {
    this.ensureLoaded();
    return Object.prototype.hasOwnProperty.call(this.store, key);
  }

  set(key: string, value: T): void {
    this.ensureLoaded();
    this.store[key] = value;
  }

  flush(): void {
    this.ensureLoaded();
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.store), "utf8");
  }
}
