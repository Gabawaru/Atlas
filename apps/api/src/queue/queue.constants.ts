export const CONTROL_QUEUE_NAME = "atlas-control-passive";
/** Dead-letter : jobs épuisés (attempts) — pas de rejeu auto agressif */
export const CONTROL_DLQ_NAME = "atlas-control-passive-dlq";
export const REDIS_URL =
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/** Tentatives worker avant DLQ */
export const CONTROL_JOB_ATTEMPTS = 3;
export const CONTROL_JOB_BACKOFF_MS = 500;

/** Payload job présence web — exclusions RoE optionnelles */
export type WebPassiveJobPayload = {
  jobRunId: string;
  missionId: string;
  tenantId: string;
  actorUserId: string;
  scopeHash: string;
  rateLimitPerMinute: number;
  syntheticMission: boolean;
  forceMockNetwork: boolean;
  targets: Array<{ host: string; url?: string }>;
  allowedHosts: string[];
  exclusions?: string[];
  /**
   * Shortlist cooperating modules (passive suite).
   * Default applied by worker when omitted/empty.
   */
  suiteModuleIds?: string[];
  /** Optional tenant artefact path for local SCA/SAST analyzers */
  localPath?: string;
  /** Skip cooperating suite (presence only) */
  skipSuite?: boolean;
};
