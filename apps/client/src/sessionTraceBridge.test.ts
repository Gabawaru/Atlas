import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIVE_TRACE_STORAGE_KEY,
  appendLiveTrace,
  hydrateLiveFromDurable,
  loadLiveTrace,
} from "./sessionTraceLive";
import {
  formatDurableBridgeHint,
  pushDurableTrace,
  type TraceBridge,
} from "./sessionTraceBridge";

class MemStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("sessionTraceBridge", () => {
  it("formatDurableBridgeHint keeps error detail", () => {
    assert.equal(
      formatDurableBridgeHint("file"),
      "Pont durable Atlas · API fichier",
    );
    assert.equal(
      formatDurableBridgeHint("error", "HTTP 401"),
      "Pont durable indisponible — cache local (HTTP 401)",
    );
    assert.equal(
      formatDurableBridgeHint("error", "Failed to fetch"),
      "Pont durable indisponible — cache local (Failed to fetch)",
    );
    assert.equal(
      formatDurableBridgeHint("error"),
      "Pont durable indisponible — cache local",
    );
    assert.equal(formatDurableBridgeHint("none"), null);
  });

  it("hydrate error surfaces detail for Session hint", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("nope", { status: 503 })) as typeof fetch;
    try {
      const r = await hydrateLiveFromDurable({
        apiBase: "http://localhost:3001",
        token: "tok",
      });
      assert.equal(r.bridge, "error");
      assert.equal(r.detail, "HTTP 503");
      assert.match(
        formatDurableBridgeHint(r.bridge, r.detail) ?? "",
        /HTTP 503/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("pushDurableTrace skips without token", async () => {
    const msg = {
      id: "x",
      role: "agent" as const,
      text: "t",
      at: "2026-11-10T00:00:00.000Z",
      details: {},
    };
    assert.equal(await pushDurableTrace(msg, null), "skipped");
  });

  it("hydrate merges durable into local cache", async () => {
    const s = new MemStorage() as unknown as Storage;
    appendLiveTrace(
      {
        id: "local-1",
        role: "prompt",
        text: "local",
        at: "2026-11-10T10:00:00.000Z",
      },
      s,
    );

    const durable = [
      {
        id: "remote-1",
        role: "agent" as const,
        text: "from API",
        at: "2026-11-10T11:00:00.000Z",
        details: { done: ["ok"] },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ messages: durable, bridge: "file" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    try {
      const bridge: TraceBridge = {
        apiBase: "http://localhost:3001",
        token: "tok",
      };
      const r = await hydrateLiveFromDurable(bridge, s);
      assert.equal(r.bridge, "file");
      const live = loadLiveTrace(s);
      assert.ok(live.some((m) => m.id === "local-1"));
      assert.ok(live.some((m) => m.id === "remote-1"));
      assert.ok(s.getItem(LIVE_TRACE_STORAGE_KEY)?.includes("remote-1"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("appendLiveTrace with bridge POSTs durable", async () => {
    const s = new MemStorage() as unknown as Storage;
    let posted: unknown = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ added: true }), { status: 200 });
    }) as typeof fetch;
    try {
      appendLiveTrace(
        {
          id: "bridged-1",
          role: "agent",
          text: "pushed",
          details: {},
        },
        s,
        { apiBase: "http://localhost:3001", token: "tok" },
      );
      // allow microtask for void push
      await new Promise((r) => setTimeout(r, 10));
      assert.equal((posted as { id: string }).id, "bridged-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
