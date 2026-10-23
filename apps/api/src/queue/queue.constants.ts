export const CONTROL_QUEUE_NAME = "atlas-control-passive";
export const REDIS_URL =
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

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
};
