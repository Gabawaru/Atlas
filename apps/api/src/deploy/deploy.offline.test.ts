import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canExecuteOffline,
  getDeployRuntime,
  remoteRevokeWhileOffline,
  resolveDeployMode,
  DEPLOY_COMPONENT_MAP,
} from "./deploy.config";

describe("modes déploiement — garde-fous offline", () => {
  it("modes valides hosted|hybrid|local", () => {
    assert.equal(resolveDeployMode("hosted"), "hosted");
    assert.equal(resolveDeployMode("hybrid"), "hybrid");
    assert.equal(resolveDeployMode("local"), "local");
    assert.equal(resolveDeployMode("nope"), "hosted");
  });

  it("matrice documente contrôle plane vs worker", () => {
    assert.ok(DEPLOY_COMPONENT_MAP.length >= 4);
    assert.ok(
      DEPLOY_COMPONENT_MAP.some((r) => /Policy Guard/i.test(r.component)),
    );
  });

  it("hébergé offline : exécution refusée", () => {
    const runtime = getDeployRuntime({
      ATLAS_DEPLOY_MODE: "hosted",
      ATLAS_OFFLINE: "true",
    } as NodeJS.ProcessEnv);
    const g = canExecuteOffline(runtime, true);
    assert.equal(g.allow, false);
    assert.equal(g.code, "OFFLINE_HOSTED");
  });

  it("hybride offline sans jeton local : refus", () => {
    const runtime = getDeployRuntime({
      ATLAS_DEPLOY_MODE: "hybrid",
      ATLAS_OFFLINE: "true",
    } as NodeJS.ProcessEnv);
    const g = canExecuteOffline(runtime, false);
    assert.equal(g.allow, false);
    assert.equal(g.code, "OFFLINE_NO_TOKEN");
  });

  it("local offline avec jeton local : autorisé (borné)", () => {
    const runtime = getDeployRuntime({
      ATLAS_DEPLOY_MODE: "local",
      ATLAS_OFFLINE: "true",
    } as NodeJS.ProcessEnv);
    const g = canExecuteOffline(runtime, true);
    assert.equal(g.allow, true);
    assert.equal(g.code, "OFFLINE_LOCAL_TOKEN");
  });

  it("révocation offline : jamais remoteConfirmed + mustQueue", () => {
    const runtime = getDeployRuntime({
      ATLAS_DEPLOY_MODE: "hybrid",
      ATLAS_OFFLINE: "true",
    } as NodeJS.ProcessEnv);
    const r = remoteRevokeWhileOffline(runtime);
    assert.equal(r.remoteConfirmed, false);
    assert.equal(r.mustQueue, true);
    assert.match(r.message, /pas de fausse révocation distante/i);
  });

  it("révocation online : pas de file obligatoire", () => {
    const runtime = getDeployRuntime({
      ATLAS_DEPLOY_MODE: "hosted",
      ATLAS_OFFLINE: "false",
    } as NodeJS.ProcessEnv);
    const r = remoteRevokeWhileOffline(runtime);
    assert.equal(r.mustQueue, false);
  });
});
