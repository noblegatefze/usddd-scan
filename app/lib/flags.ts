export type PublicFlags = {
  pause_all: boolean;
  pause_reserve: boolean;
  pause_stats_ingest: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

const KEY = "dd_public_flags_cache_v1";
const TTL_MS = 5 * 60_000; // 5 min (reduce chatter)

// In-memory cache + in-flight de-dupe (prevents hammering even if callers spam)
let memCache: { t: number; flags: PublicFlags } | null = null;
let inFlight: Promise<PublicFlags> | null = null;

export async function getPublicFlags(): Promise<PublicFlags> {
  const now = Date.now();

  // 0) memory cache first
  if (memCache && now - memCache.t < TTL_MS) return memCache.flags;

  // 1) localStorage cache
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { t: number; flags: PublicFlags };
      if (cached?.t && cached.flags && now - cached.t < TTL_MS) {
        memCache = cached;
        return cached.flags;
      }
    }
  } catch {
    // ignore
  }

  // 2) De-dupe concurrent fetches
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const r = await fetch("/api/flags", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      const flags = (j?.flags ?? null) as PublicFlags | null;

      if (flags && typeof flags.pause_all === "boolean") {
        const cached = { t: Date.now(), flags };
        memCache = cached;
        try {
          localStorage.setItem(KEY, JSON.stringify(cached));
        } catch {}
        return flags;
      }
    } catch {
      // ignore
    } finally {
      inFlight = null;
    }

    // 3) fail CLOSED (safer): show maintenance if uncertain
    const closed = { pause_all: true, pause_reserve: true, pause_stats_ingest: true };
    memCache = { t: Date.now(), flags: closed };
    return closed;
  })();

  return inFlight;
}
