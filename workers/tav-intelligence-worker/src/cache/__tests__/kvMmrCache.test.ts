import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KvMmrCache } from "../kvMmrCache";
import type { MmrResponseEnvelope } from "../../validate";

// ── Map-backed fake KV ────────────────────────────────────────────────────────
//
// Mirrors only the surface KvMmrCache uses: get(key, { type: 'json' }),
// put(key, value, { expirationTtl }), delete(key). Stores TTL alongside
// values so tests can assert it.

interface PutCall {
  key:    string;
  value:  string;
  ttl:    number | undefined;
}

function makeFakeKv(opts?: {
  rawValues?: Record<string, string>;
}): { kv: KVNamespace; puts: PutCall[]; deletes: string[] } {
  const store = new Map<string, string>();
  if (opts?.rawValues) {
    for (const [k, v] of Object.entries(opts.rawValues)) {
      store.set(k, v);
    }
  }
  const puts:    PutCall[] = [];
  const deletes: string[]  = [];

  const kv = {
    get: vi.fn(async (key: string, options?: { type?: string }) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      if (options?.type === "json") {
        return JSON.parse(raw) as unknown;
      }
      return raw;
    }),
    put: vi.fn(async (
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ) => {
      store.set(key, value);
      puts.push({ key, value, ttl: options?.expirationTtl });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
      deletes.push(key);
    }),
    list:   vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;

  return { kv, puts, deletes };
}

const sampleEnvelope: MmrResponseEnvelope = {
  ok:                  true,
  mmr_value:           18_500,
  mileage_used:        45_000,
  is_inferred_mileage: false,
  cache_hit:           false,
  source:              "manheim",
  fetched_at:          "2026-05-07T12:00:00.000Z",
  expires_at:          "2026-05-08T12:00:00.000Z",
  mmr_payload:         { items: [{ wholesale: { average: 18500 } }] },
  error_code:          null,
  error_message:       null,
};

describe("KvMmrCache", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function logEvents(): Array<{ event: string; [k: string]: unknown }> {
    return logSpy.mock.calls.map((call) =>
      JSON.parse(String(call[0])) as { event: string; [k: string]: unknown },
    );
  }

  it("returns the parsed envelope on hit", async () => {
    const { kv } = makeFakeKv({
      rawValues: { "mmr:vin:1HGCM82633A123456": JSON.stringify(sampleEnvelope) },
    });
    const cache = new KvMmrCache(kv);
    const got = await cache.get("vin:1HGCM82633A123456", "req-1");
    expect(got).toEqual(sampleEnvelope);
    expect(logEvents().some((e) =>
      e.event === "mmr.cache.hit" &&
      e.cacheKey === "vin:1HGCM82633A123456" &&
      e.requestId === "req-1",
    )).toBe(true);
  });

  it("returns null on miss", async () => {
    const { kv } = makeFakeKv();
    const cache = new KvMmrCache(kv);
    const got = await cache.get("vin:UNKNOWN", "req-2");
    expect(got).toBeNull();
    expect(logEvents().some((e) =>
      e.event === "mmr.cache.miss" && e.requestId === "req-2",
    )).toBe(true);
  });

  it("set writes the prefixed key, JSON-stringified value, and TTL", async () => {
    const { kv, puts } = makeFakeKv();
    const cache = new KvMmrCache(kv);
    await cache.set("vin:ABC", sampleEnvelope, 86_400, "req-3");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBe("mmr:vin:ABC");
    expect(JSON.parse(puts[0]?.value as string)).toEqual(sampleEnvelope);
    expect(puts[0]?.ttl).toBe(86_400);
    expect(logEvents().some((e) =>
      e.event === "mmr.cache.set" && e.ttl_seconds === 86_400,
    )).toBe(true);
  });

  it("set clamps sub-60s TTLs up to the KV minimum", async () => {
    const { kv, puts } = makeFakeKv();
    const cache = new KvMmrCache(kv);
    await cache.set("vin:CLAMP", sampleEnvelope, 30, "req-4");
    expect(puts[0]?.ttl).toBe(60);
  });

  it("invalidate deletes the prefixed key", async () => {
    const { kv, deletes } = makeFakeKv({
      rawValues: { "mmr:vin:GONE": JSON.stringify(sampleEnvelope) },
    });
    const cache = new KvMmrCache(kv);
    await cache.invalidate("vin:GONE", "req-5");
    expect(deletes).toEqual(["mmr:vin:GONE"]);
    expect(logEvents().some((e) =>
      e.event === "mmr.cache.invalidate" && e.cacheKey === "vin:GONE",
    )).toBe(true);
  });

  it("includes requestId on every emitted log", async () => {
    const { kv } = makeFakeKv();
    const cache = new KvMmrCache(kv);
    await cache.get("vin:X", "req-trace");
    await cache.set("vin:X", sampleEnvelope, 3_600, "req-trace");
    await cache.invalidate("vin:X", "req-trace");
    const events = logEvents();
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const e of events) {
      expect(e.requestId).toBe("req-trace");
    }
  });

  it("treats malformed cached JSON as a miss (does not throw)", async () => {
    const store = new Map<string, string>([["mmr:vin:BAD", "{not-json"]]);
    const kv = {
      get: vi.fn(async (key: string, options?: { type?: string }) => {
        const raw = store.get(key);
        if (raw === undefined) return null;
        if (options?.type === "json") {
          // Mimic CF KV behavior: throws on malformed JSON when type=json.
          throw new SyntaxError("Unexpected token in JSON");
        }
        return raw;
      }),
      put:    vi.fn(),
      delete: vi.fn(),
      list:   vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;

    const cache = new KvMmrCache(kv);
    const got = await cache.get("vin:BAD", "req-bad");
    expect(got).toBeNull();
    expect(logEvents().some((e) =>
      e.event === "mmr.cache.miss" && e.reason === "json_parse_error",
    )).toBe(true);
  });
});
