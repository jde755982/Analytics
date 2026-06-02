/**
 * Safe dotted-path getter. Resolves "eventData.text" against an object without
 * throwing on missing intermediate keys. Returns undefined if any segment is
 * absent or not an object.
 *
 * This is the single place the app turns a config `textPath` (see config.ts)
 * into an actual value, so event-schema assumptions stay declarative.
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Resolve a textPath and coerce to a trimmed string, or undefined if absent /
 * not stringifiable to meaningful text.
 */
export function getText(obj: unknown, path: string): string | undefined {
  const v = getByPath(obj, path);
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : undefined;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}
