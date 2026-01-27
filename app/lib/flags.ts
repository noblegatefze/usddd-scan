export type PublicFlags = {
  pause_all: boolean;
  pause_reserve: boolean;
  pause_stats_ingest: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

const KEY = "dd_public_flags_cache_v1";
const TTL_MS = 60_000; // 60s

function baseUrl() {
  // Local dev: scan runs on 3001, terminal on 3000
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3000";
  }
  return "https://digdug.do";
}

export async function getPublicFlags(): Promise<PublicFlags> {
  // 1) try cache first
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { t: number; flags: PublicFlags };
      if (cached?.t && Date.now() - cached.t < TTL_MS && cached.flags) {
        return cached.flags;
      }
    }
  } catch {
    // ignore
  }

  // 2) fetch from terminal
  try {
    const r = await fetch("/api/flags", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    const flags = (j?.flags ?? null) as PublicFlags | null;
    if (flags && typeof flags.pause_all === "boolean") {
      try {
        localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), flags }));
      } catch {}
      return flags;
    }
  } catch {
    // ignore
  }

  // 3) fail CLOSED (safer): show maintenance if uncertain
  return { pause_all: true, pause_reserve: true, pause_stats_ingest: true };
}
