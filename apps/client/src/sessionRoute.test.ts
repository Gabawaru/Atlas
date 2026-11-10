import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashForRoute, parseSessionHash } from "./sessionRoute";
import {
  AGENT_STATUS_LABEL,
  chronologicalTrace,
  SESSION_TRACE_SEED,
  summarizeTrace,
} from "./sessionTrace";
import {
  AGENT_REDIRECT_STORAGE_KEY,
  listAgentRedirects,
  sendAgentRedirect,
} from "./agentRedirect";

describe("parseSessionHash", () => {
  it("defaults to session", () => {
    assert.equal(parseSessionHash(""), "session");
    assert.equal(parseSessionHash("#"), "session");
    assert.equal(parseSessionHash("#session"), "session");
    assert.equal(parseSessionHash("#other"), "session");
  });

  it("recognizes trace aliases", () => {
    assert.equal(parseSessionHash("#session/trace"), "session-trace");
    assert.equal(parseSessionHash("#trace"), "session-trace");
  });

  it("recognizes scanner, tracking, terminal", () => {
    assert.equal(parseSessionHash("#scanner"), "scanner");
    assert.equal(parseSessionHash("#suivi"), "tracking");
    assert.equal(parseSessionHash("#tracking"), "tracking");
    assert.equal(parseSessionHash("#terminal"), "terminal");
    assert.equal(parseSessionHash("#session-term"), "terminal");
    assert.equal(parseSessionHash("#local"), "terminal");
  });
});

describe("hashForRoute", () => {
  it("round-trips", () => {
    assert.equal(hashForRoute("session"), "#session");
    assert.equal(hashForRoute("session-trace"), "#session/trace");
    assert.equal(hashForRoute("scanner"), "#scanner");
    assert.equal(hashForRoute("tracking"), "#suivi");
    assert.equal(hashForRoute("terminal"), "#terminal");
  });
});

describe("chronologicalTrace + summarizeTrace (Gabriel)", () => {
  it("keeps seed ordered by time", () => {
    const list = chronologicalTrace(SESSION_TRACE_SEED);
    assert.ok(list.length >= 2);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i - 1]!.at <= list[i]!.at);
    }
  });

  it("summary mentions Gabriel and status", () => {
    const s = summarizeTrace(SESSION_TRACE_SEED, "working");
    assert.match(s.headline, /Gabriel/i);
    assert.match(s.headline, new RegExp(AGENT_STATUS_LABEL.working, "i"));
    assert.ok(s.bullets.length >= 1 && s.bullets.length <= 3);
  });
});

describe("sendAgentRedirect", () => {
  it("queues locally with sessionOwner gabriel", async () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AGENT_REDIRECT_STORAGE_KEY);
    }
    const result = await sendAgentRedirect({
      message: "Priorité : finir le fil session Gabriel",
      apiBase: "http://127.0.0.1:9",
      token: null,
    });
    assert.equal(result.queued.sessionOwner, "gabriel");
    assert.equal(result.api, "skipped");
    if (typeof localStorage !== "undefined") {
      const q = listAgentRedirects();
      assert.ok(q.some((x) => x.id === result.queued.id));
      localStorage.removeItem(AGENT_REDIRECT_STORAGE_KEY);
    }
  });
});
