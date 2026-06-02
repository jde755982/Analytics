/**
 * Anthropic client + defensive JSON helpers shared by classification and
 * relevance scoring. The API key is read from ANTHROPIC_API_KEY (server only)
 * and never leaves this process.
 */
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — classification and relevance scoring are disabled.",
    );
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Strip accidental ```json … ``` fences and surrounding prose, then JSON.parse.
 * Returns undefined instead of throwing so callers can degrade gracefully.
 */
export function parseJsonArray<T = unknown>(raw: string): T[] | undefined {
  let text = raw.trim();

  // Remove a leading ```json / ``` fence and trailing ``` if present.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence) text = fence[1].trim();

  // If there is still surrounding prose, grab the outermost [ … ] array.
  if (!text.startsWith("[")) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) text = text.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Extract concatenated text from a Messages API response. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
