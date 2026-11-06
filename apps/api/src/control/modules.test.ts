import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SHORTLIST_MODULE_REGISTRY,
  registrySummary,
  listWiredModuleIds,
  DEFAULT_PASSIVE_SUITE_IDS,
  DEFAULT_LOCAL_SUITE_IDS,
  runCooperatingSuite,
  planDefaultSuite,
  resolveAdapter,
  listRunnableModuleIds,
} from "./modules";
import { isAggressiveModule } from "@atlas/policy-guard";

describe("shortlist module registry", () => {
  it("couvre ~94 outils shortlist", () => {
    const s = registrySummary();
    assert.equal(s.total, 94);
    assert.ok(s.wired >= 90, `wired=${s.wired}`);
    assert.ok(s.blocked >= 1 && s.blocked <= 5, `blocked=${s.blocked}`);
    assert.equal(s.wired + s.stub + s.blocked, 94);
    assert.equal(s.stub, 0);
  });

  it("ids uniques", () => {
    const ids = SHORTLIST_MODULE_REGISTRY.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("modules wired ont un adapter runnable", () => {
    for (const id of listWiredModuleIds()) {
      assert.ok(resolveAdapter(id), `adapter manquant pour ${id}`);
    }
  });

  it("modules wired non-chaos ne sont pas aggressifs Policy Guard", () => {
    for (const id of listWiredModuleIds()) {
      if (id.startsWith("chaos.")) continue;
      assert.equal(isAggressiveModule(id), false, id);
    }
    assert.equal(isAggressiveModule("chaos.chaos-mesh.auth.v1"), true);
    assert.equal(isAggressiveModule("network.aggressive.scan.v1"), true);
  });
});

describe("cooperating suite", () => {
  it("planDefaultSuite passive sans localPath", () => {
    const plan = planDefaultSuite({});
    assert.deepEqual(plan.passiveIds, [...DEFAULT_PASSIVE_SUITE_IDS]);
    assert.equal(plan.localIds.length, 0);
  });

  it("planDefaultSuite avec localPath ajoute analyzers", () => {
    const plan = planDefaultSuite({ localPath: "/tmp/artefact" });
    assert.ok(plan.localIds.length === DEFAULT_LOCAL_SUITE_IDS.length);
  });

  it("runCooperatingSuite mock forceMock — pas d'appel réseau", async () => {
    const results = await runCooperatingSuite(
      ["asm.crtsh.passive.v1", "email.mail-auth.dns.passive.v1", "web.observatory.passive.v1"],
      {
        targets: [{ host: "console.pragma-serve.com" }],
        allowedHosts: new Set(["console.pragma-serve.com"]),
        exclusions: new Set(),
        rateLimitPerMinute: 120,
        syntheticMission: true,
        forceMock: true,
        isCancelled: () => false,
        priorEvidence: {},
        sleepFn: async () => undefined,
      },
    );
    assert.equal(results.length, 3);
    for (const r of results) {
      assert.equal(r.status, "ok", `${r.moduleId} → ${r.status} ${r.error}`);
      assert.ok(r.evidence);
    }
  });

  it("blocked module → skipped", async () => {
    const results = await runCooperatingSuite(
      ["breach.google-password-checkup.auth.v1"],
      {
        targets: [{ host: "console.pragma-serve.com" }],
        allowedHosts: new Set(["console.pragma-serve.com"]),
        exclusions: new Set(),
        rateLimitPerMinute: 60,
        syntheticMission: true,
        forceMock: true,
        isCancelled: () => false,
        priorEvidence: {},
      },
    );
    assert.equal(results[0]!.status, "skipped");
  });

  it("chaos lab sans ATLAS_CHAOS_LAB_APPROVED → needs_config", async () => {
    const results = await runCooperatingSuite(["chaos.chaos-mesh.auth.v1"], {
      targets: [{ host: "console.pragma-serve.com" }],
      allowedHosts: new Set(["console.pragma-serve.com"]),
      exclusions: new Set(),
      rateLimitPerMinute: 60,
      syntheticMission: false,
      forceMock: false,
      isCancelled: () => false,
      priorEvidence: {},
      env: { CHAOS_MESH_URL: "https://chaos.example" },
      sleepFn: async () => undefined,
    });
    assert.equal(results[0]!.status, "needs_config");
  });

  it("chaos lab forceMock → ok catalog readiness (pas d'inject)", async () => {
    const results = await runCooperatingSuite(["chaos.chaos-mesh.auth.v1"], {
      targets: [{ host: "console.pragma-serve.com" }],
      allowedHosts: new Set(["console.pragma-serve.com"]),
      exclusions: new Set(),
      rateLimitPerMinute: 60,
      syntheticMission: true,
      forceMock: true,
      isCancelled: () => false,
      priorEvidence: {},
      sleepFn: async () => undefined,
    });
    assert.equal(results[0]!.status, "ok");
    const ev = results[0]!.evidence as { injectDisabled?: boolean };
    assert.equal(ev.injectDisabled, true);
  });

  it("quad9 / mozilla-monitor / falco mock → ok", async () => {
    const results = await runCooperatingSuite(
      [
        "dns.quad9.passive.v1",
        "breach.mozilla-monitor.passive.v1",
        "cloud.falco.auth.v1",
        "firmware.chipsec.local.v1",
      ],
      {
        targets: [{ host: "console.pragma-serve.com" }],
        allowedHosts: new Set(["console.pragma-serve.com"]),
        exclusions: new Set(),
        rateLimitPerMinute: 60,
        syntheticMission: true,
        forceMock: true,
        localPath: "/tmp/rules.yaml",
        isCancelled: () => false,
        priorEvidence: {},
        sleepFn: async () => undefined,
      },
    );
    assert.equal(results.length, 4);
    for (const r of results) {
      assert.equal(r.status, "ok", `${r.moduleId} → ${r.status} ${r.error}`);
    }
  });

  it("keyed adapter sans clés (hors mock) → needs_config + requiredEnv", async () => {
    const results = await runCooperatingSuite(["asm.shodan.passive.v1"], {
      targets: [{ host: "console.pragma-serve.com" }],
      allowedHosts: new Set(["console.pragma-serve.com"]),
      exclusions: new Set(),
      rateLimitPerMinute: 60,
      syntheticMission: false,
      forceMock: false,
      isCancelled: () => false,
      priorEvidence: {},
      env: {},
      sleepFn: async () => undefined,
    });
    assert.equal(results[0]!.status, "needs_config");
    const ev = results[0]!.evidence as { requiredEnv?: string[] };
    assert.ok(ev.requiredEnv?.includes("SHODAN_API_KEY"));
  });

  it("keyed adapter forceMock → ok sans clés", async () => {
    const results = await runCooperatingSuite(["asm.shodan.passive.v1"], {
      targets: [{ host: "console.pragma-serve.com" }],
      allowedHosts: new Set(["console.pragma-serve.com"]),
      exclusions: new Set(),
      rateLimitPerMinute: 60,
      syntheticMission: true,
      forceMock: true,
      isCancelled: () => false,
      priorEvidence: {},
      sleepFn: async () => undefined,
    });
    assert.equal(results[0]!.status, "ok");
  });

  it("phish lab sans ATLAS_PHISH_LAB_APPROVED → needs_config", async () => {
    const results = await runCooperatingSuite(["phish.gophish.auth.v1"], {
      targets: [{ host: "console.pragma-serve.com" }],
      allowedHosts: new Set(["console.pragma-serve.com"]),
      exclusions: new Set(),
      rateLimitPerMinute: 60,
      syntheticMission: false,
      forceMock: false,
      isCancelled: () => false,
      priorEvidence: {},
      env: { GOPHISH_URL: "https://gophish.example", GOPHISH_API_KEY: "x" },
      sleepFn: async () => undefined,
    });
    assert.equal(results[0]!.status, "needs_config");
  });

  it("refuse hors scope (RoE)", async () => {
    await assert.rejects(
      () =>
        runCooperatingSuite(["asm.crtsh.passive.v1"], {
          targets: [{ host: "evil.example.net" }],
          allowedHosts: new Set(["console.pragma-serve.com"]),
          exclusions: new Set(),
          rateLimitPerMinute: 60,
          syntheticMission: false,
          forceMock: true,
          isCancelled: () => false,
          priorEvidence: {},
        }).then((rows) => {
          // adapter throws → suite wraps as error
          if (rows[0]?.status === "error") {
            throw new Error(rows[0].error ?? "error");
          }
          return rows;
        }),
      /OUT_OF_SCOPE|ROE|error|GATED|TARGET/i,
    );
  });

  it("local analyzer sans path → needs_config", async () => {
    const results = await runCooperatingSuite(["sca.trivy.local.v1"], {
      targets: [{ host: "console.pragma-serve.com" }],
      allowedHosts: new Set(["console.pragma-serve.com"]),
      exclusions: new Set(),
      rateLimitPerMinute: 60,
      syntheticMission: false,
      forceMock: false,
      isCancelled: () => false,
      priorEvidence: {},
    });
    assert.equal(results[0]!.status, "needs_config");
  });

  it("local analyzer forceMock → ok sans binaire", async () => {
    const results = await runCooperatingSuite(["sca.trivy.local.v1"], {
      targets: [{ host: "console.pragma-serve.com" }],
      allowedHosts: new Set(["console.pragma-serve.com"]),
      exclusions: new Set(),
      rateLimitPerMinute: 60,
      syntheticMission: true,
      forceMock: true,
      localPath: "/tmp/x",
      isCancelled: () => false,
      priorEvidence: {},
    });
    assert.equal(results[0]!.status, "ok");
  });

  it("listRunnableModuleIds couvre les wired", () => {
    assert.ok(listRunnableModuleIds().length >= 70);
  });
});
