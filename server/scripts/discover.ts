/**
 * ============================================================================
 *  DISCOVERY SCRIPT (dev-only)
 * ============================================================================
 *
 *  Purpose: figure out which `eventName` carries the user's question text vs.
 *  the agent's answer text, so we can fill in `eventSchema` in src/config.ts.
 *
 *  It calls POST /stat/export for a given palId over a WIDE date range and
 *  prints every distinct eventName with:
 *      - its occurrence count
 *      - one pretty-printed sample `eventData`
 *
 *  This is the ONLY place allowed to print full conversation content — it is a
 *  developer tool, never wired into production request paths.
 *
 *  Usage:
 *      npm run discover -- --palId <PAL_ID> [--from <ms>] [--to <ms>]
 *      STARPAL_API_BASE=... npm run discover -- --palId <PAL_ID>
 * ============================================================================
 */
import "../src/env.js"; // load env before config.ts reads process.env
import { statExport, UpstreamEmptyError, type RawEvent } from "../src/lib/upstream.js";
import { upstream } from "../src/config.js";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function truncate(s: string, max = 4000): string {
  return s.length > max ? `${s.slice(0, max)}\n… [truncated, ${s.length} chars total]` : s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const palId = args.palId || process.env.PAL_ID;

  if (!palId) {
    console.error("ERROR: --palId <PAL_ID> is required.");
    console.error("Usage: npm run discover -- --palId <PAL_ID> [--from <ms>] [--to <ms>]");
    process.exit(1);
  }

  // Default to a deliberately wide window: 2020-01-01 .. now.
  const from = args.from ? Number(args.from) : Date.parse("2020-01-01T00:00:00Z");
  const to = args.to ? Number(args.to) : Date.now();

  console.log(`Upstream base : ${upstream.baseUrl}`);
  console.log(`palId         : ${palId}`);
  console.log(`from          : ${from} (${new Date(from).toISOString()})`);
  console.log(`to            : ${to} (${new Date(to).toISOString()})`);
  console.log("Fetching /stat/export …\n");

  let events: RawEvent[];
  try {
    const res = await statExport({ palId, from, to });
    events = res.events ?? [];
  } catch (err) {
    if (err instanceof UpstreamEmptyError) {
      console.log("Upstream returned 404 — no data for this Pal/range (empty state).");
      return;
    }
    throw err;
  }

  if (events.length === 0) {
    console.log("No events returned for this Pal/range.");
    return;
  }

  // Group by eventName: count + first sample.
  const byName = new Map<string, { count: number; sample: unknown }>();
  for (const ev of events) {
    const entry = byName.get(ev.eventName);
    if (entry) {
      entry.count++;
    } else {
      byName.set(ev.eventName, { count: 1, sample: ev.eventData });
    }
  }

  const sorted = [...byName.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log("============================================================");
  console.log(`Total events: ${events.length}  |  Distinct eventNames: ${sorted.length}`);
  console.log("============================================================\n");

  for (const [name, { count, sample }] of sorted) {
    console.log(`eventName: ${name}`);
    console.log(`count    : ${count}`);
    console.log("sample eventData:");
    console.log(truncate(JSON.stringify(sample, null, 2)));
    console.log("------------------------------------------------------------\n");
  }

  console.log("Next step: map the question/answer event names into");
  console.log("  src/config.ts -> eventSchema  (set names[] and textPath).");
}

main().catch((err) => {
  console.error("Discovery failed:", err);
  process.exit(1);
});
