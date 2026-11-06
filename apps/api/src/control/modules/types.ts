/**
 * Shared contract for shortlist-backed Atlas control modules.
 * All modules share mission scope / RoE / cancel / report shape.
 * Defensive / passive / authenticated-only — never exploit payloads.
 */

export type ModuleWireStatus =
  | "wired"
  | "stub"
  | "blocked";

export type ModuleCategory =
  | "asm"
  | "breach"
  | "sca_secrets"
  | "firmware"
  | "host_auth"
  | "web_passive"
  | "edr"
  | "email"
  | "dns"
  | "cloud_posture"
  | "threat_intel"
  | "physical"
  | "backup"
  | "phishing"
  | "zta"
  | "ai_guardrails"
  | "iam"
  | "dlp"
  | "sast"
  | "chaos"
  | "tprm"
  | "compliance";

export type ModuleKind =
  | "passive_api"
  | "local_analyzer"
  | "auth_api"
  | "auth_agent"
  | "enrolled_program"
  | "saas_portal";

export interface ModuleDefinition {
  /** Stable id, e.g. asm.crtsh.passive.v1 */
  id: string;
  /** Shortlist tool name */
  shortlistTool: string;
  category: ModuleCategory;
  kind: ModuleKind;
  label: string;
  description: string;
  wireStatus: ModuleWireStatus;
  /** Why stub/blocked when not wired */
  wireNote?: string;
  /** Parent Atlas module for Policy Guard (default web.passive.presence.v1) */
  parentModuleId: string;
  /** Optional connector catalog id */
  connectorId?: string;
  /** Env vars read for real API (never Paradise / Sign secrets) */
  envKeys?: string[];
  /** Cooperates with these module ids (shared evidence) */
  cooperatesWith?: string[];
  rateLimitPerMinuteDefault?: number;
}

export interface ModuleTarget {
  host: string;
  url?: string;
}

/** Shared context passed to every cooperating adapter in a mission job. */
export interface ModuleRunContext {
  targets: ModuleTarget[];
  allowedHosts: Set<string>;
  exclusions: Set<string>;
  rateLimitPerMinute: number;
  syntheticMission: boolean;
  forceMock: boolean;
  isCancelled: () => boolean;
  /** Evidence from earlier suite modules (keyed by module id) */
  priorEvidence: Record<string, unknown>;
  /** Presence web results when suite runs after web.passive */
  presenceEvidence?: unknown;
  sleepFn?: (ms: number) => Promise<void>;
  fetchFn?: typeof fetch;
  /** Local path for SCA/SAST (tenant artefact) — never remote exploit */
  localPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ModuleFindingLite {
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  technical?: string;
}

export interface ModuleRunResult {
  moduleId: string;
  shortlistTool: string;
  status: "ok" | "skipped" | "error" | "needs_config" | "binary_missing";
  observedAt: string;
  evidence: unknown;
  findings?: ModuleFindingLite[];
  disclaimer: string;
  error?: string;
  /** ms */
  durationMs?: number;
}

export type ModuleAdapter = (
  ctx: ModuleRunContext,
) => Promise<ModuleRunResult>;

export const DEFAULT_PARENT_MODULE = "web.passive.presence.v1";

export const MODULE_DISCLAIMER_PASSIVE =
  "Module passif / défensif Atlas — in-scope RoE uniquement ; pas d'exploit, pas de scan agressif non authentifié.";

export const MODULE_DISCLAIMER_STUB =
  "Stub catalogue — non exécuté en production tant que connecteur/clés/agent non branchés.";
